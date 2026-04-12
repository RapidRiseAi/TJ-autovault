'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { dispatchRecentCustomerNotifications } from '@/lib/email/dispatch-now';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  WORK_REQUEST_STATUSES,
  type WorkRequestStatus
} from '@/lib/work-request-statuses';
import { addVehicleSchema } from '@/lib/validation/vehicle';
import { z } from 'zod';

type Result =
  | { ok: true; message?: string; vehicleId?: string; customerAccountId?: string }
  | { ok: false; error: string };

function isMissingNotesColumnError(
  error: { code?: string; message?: string } | null
) {
  if (!error) return false;

  const combined = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  const mentionsNotesColumn =
    combined.includes('notes') && combined.includes('column');
  const mentionsSchemaCache =
    combined.includes('schema cache') || combined.includes('postgrest');

  return (
    (error.code === 'PGRST204' && mentionsNotesColumn) ||
    (mentionsNotesColumn && mentionsSchemaCache) ||
    combined.includes("could not find the 'notes' column")
  );
}


function isMissingProspectColumnsError(
  error: { code?: string; message?: string } | null
) {
  if (!error) return false;

  const combined = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  const mentionsLinkedEmail =
    combined.includes('linked_email') ||
    combined.includes("'linked_email'") ||
    combined.includes('customer_accounts.linked_email');
  const mentionsOnboardingStatus =
    combined.includes('onboarding_status') ||
    combined.includes("'onboarding_status'") ||
    combined.includes('customer_accounts.onboarding_status');

  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    mentionsLinkedEmail ||
    mentionsOnboardingStatus
  );
}


type InvoiceFinanceSyncInput = {
  workshopAccountId: string;
  invoiceId: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: string | null;
  totalCents: number;
  occurredOnIso?: string | null;
  actorId?: string | null;
};

async function syncInvoiceIncomeEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: InvoiceFinanceSyncInput
) {
  const occurredOn = (input.occurredOnIso ?? new Date().toISOString()).slice(0, 10);

  if (input.paymentStatus === 'paid') {
    const { error } = await supabase.from('workshop_finance_entries').upsert(
      {
        workshop_account_id: input.workshopAccountId,
        entry_kind: 'income',
        source_type: 'job_income',
        category: 'jobs',
        description: 'Invoice payment',
        amount_cents: Math.max(input.totalCents ?? 0, 0),
        occurred_on: occurredOn,
        external_ref_type: 'invoice',
        external_ref_id: input.invoiceId,
        metadata: {
          invoice_id: input.invoiceId,
          payment_method: input.paymentMethod ?? null
        },
        created_by: input.actorId ?? null
      },
      { onConflict: 'workshop_account_id,source_type,external_ref_type,external_ref_id' }
    );

    if (!error) return;
    const combined = `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
    if (!combined.includes('workshop_finance_entries') && !combined.includes('does not exist')) {
      throw error;
    }
    return;
  }

  const { error } = await supabase
    .from('workshop_finance_entries')
    .delete()
    .eq('workshop_account_id', input.workshopAccountId)
    .eq('source_type', 'job_income')
    .eq('external_ref_type', 'invoice')
    .eq('external_ref_id', input.invoiceId);

  if (!error) return;
  const combined = `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  if (!combined.includes('workshop_finance_entries') && !combined.includes('does not exist')) {
    throw error;
  }
}

async function applyWorkshopCustomerCreditsToInvoice(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workshopAccountId: string;
  customerAccountId: string;
  invoiceId: string;
  maxApplyCents: number;
  actorProfileId: string;
}) {
  if (input.maxApplyCents <= 0) return 0;

  const { data: ledgerRows, error } = await input.supabase
    .from('customer_credit_ledger')
    .select('id,remaining_cents')
    .eq('workshop_account_id', input.workshopAccountId)
    .eq('customer_account_id', input.customerAccountId)
    .gt('remaining_cents', 0)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !ledgerRows?.length) return 0;

  let remaining = input.maxApplyCents;
  let applied = 0;

  for (const row of ledgerRows) {
    if (remaining <= 0) break;
    const available = Number(row.remaining_cents ?? 0);
    const consume = Math.min(available, remaining);
    if (consume <= 0) continue;

    const { error: updateError } = await input.supabase
      .from('customer_credit_ledger')
      .update({ remaining_cents: available - consume })
      .eq('id', row.id)
      .eq('workshop_account_id', input.workshopAccountId);
    if (updateError) continue;

    await input.supabase.from('invoice_credit_applications').insert({
      workshop_account_id: input.workshopAccountId,
      customer_account_id: input.customerAccountId,
      invoice_id: input.invoiceId,
      ledger_entry_id: row.id,
      amount_cents: consume
    });
    await input.supabase.from('customer_credit_ledger').insert({
      workshop_account_id: input.workshopAccountId,
      customer_account_id: input.customerAccountId,
      source_type: 'credit_application',
      source_id: input.invoiceId,
      description: `Applied to invoice ${input.invoiceId.slice(0, 8).toUpperCase()}`,
      delta_cents: -consume,
      remaining_cents: 0,
      created_by: input.actorProfileId
    });

    remaining -= consume;
    applied += consume;
  }

  return applied;
}

async function getWorkshopContext() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  )
    return null;
  return { supabase, profile };
}

async function getVehicleContext(
  ctx: NonNullable<Awaited<ReturnType<typeof getWorkshopContext>>>,
  vehicleId: string
) {
  return ctx.supabase
    .from('vehicles')
    .select(
      'id,workshop_account_id,current_customer_account_id,registration_number'
    )
    .eq('id', vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();
}


const createWorkshopCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name is required').max(120),
  linkedEmail: z.string().trim().email('Enter a valid email').max(255).optional().or(z.literal('')),
  onboardingStatus: z.enum(['prospect_unpaid', 'registered_unpaid', 'active_paid']).default('prospect_unpaid')
});

export async function createWorkshopCustomerAccount(input: unknown): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = createWorkshopCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid customer data' };
  }

  const payload = parsed.data;
  const linkedEmail = payload.linkedEmail?.trim().toLowerCase() || null;

  const admin = createAdminClient();

  if (linkedEmail) {
    const { data: existingEmail, error: existingEmailError } = await admin
      .from('customer_accounts')
      .select('id,auth_user_id')
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .ilike('linked_email', linkedEmail)
      .limit(1)
      .maybeSingle();

    if (existingEmailError && !isMissingProspectColumnsError(existingEmailError)) {
      return { ok: false, error: existingEmailError.message };
    }

    if (existingEmail?.id) {
      if (!existingEmail.auth_user_id) {
        const { data: reused, error: reuseError } = await admin
          .from('customer_accounts')
          .update({
            name: payload.name.trim(),
            onboarding_status: payload.onboardingStatus
          })
          .eq('id', existingEmail.id)
          .eq('workshop_account_id', ctx.profile.workshop_account_id)
          .select('id')
          .single();

        if (!reuseError && reused) {
          revalidatePath('/workshop/dashboard');
          revalidatePath('/workshop/customers');
          revalidatePath(`/workshop/customers/${reused.id}`);
          return { ok: true, message: 'Customer account updated.', customerAccountId: reused.id };
        }
      }

      return { ok: false, error: 'A customer with that linked email already exists in your workshop.' };
    }

    const { data: matchingNameUnlinked, error: matchingNameError } = await admin
      .from('customer_accounts')
      .select('id')
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .is('auth_user_id', null)
      .is('linked_email', null)
      .ilike('name', payload.name.trim())
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (matchingNameError && !isMissingProspectColumnsError(matchingNameError)) {
      return { ok: false, error: matchingNameError.message };
    }

    if (matchingNameUnlinked?.id) {
      const { data: linkedExisting, error: linkExistingError } = await admin
        .from('customer_accounts')
        .update({
          linked_email: linkedEmail,
          onboarding_status: payload.onboardingStatus
        })
        .eq('id', matchingNameUnlinked.id)
        .eq('workshop_account_id', ctx.profile.workshop_account_id)
        .select('id')
        .single();

      if (!linkExistingError && linkedExisting) {
        revalidatePath('/workshop/dashboard');
        revalidatePath('/workshop/customers');
        revalidatePath(`/workshop/customers/${linkedExisting.id}`);
        return { ok: true, message: 'Existing customer linked to email.', customerAccountId: linkedExisting.id };
      }
    }
  }

  let { data: customer, error } = await admin
    .from('customer_accounts')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      name: payload.name.trim(),
      linked_email: linkedEmail,
      onboarding_status: payload.onboardingStatus
    })
    .select('id')
    .single();

  if (isMissingProspectColumnsError(error)) {
    ({ data: customer, error } = await admin
      .from('customer_accounts')
      .insert({
        workshop_account_id: ctx.profile.workshop_account_id,
        name: payload.name.trim()
      })
      .select('id')
      .single());
  }

  if (error || !customer) {
    return { ok: false, error: error?.message ?? 'Could not create customer account' };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/customers/${customer.id}`);

  return { ok: true, message: 'Customer account created.', customerAccountId: customer.id };
}

const workshopVehicleSchema = addVehicleSchema.extend({
  customerAccountId: z.string().uuid(),
  isTemporary: z.boolean().optional().default(false)
});

const workshopVehicleUpdateSchema = addVehicleSchema.extend({
  vehicleId: z.string().uuid(),
  isTemporary: z.boolean().optional().default(false)
});

export async function createWorkshopCustomerVehicle(
  input: unknown
): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = workshopVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data'
    };
  }

  const payload = parsed.data;
  const { data: customer } = await ctx.supabase
    .from('customer_accounts')
    .select('id')
    .eq('id', payload.customerAccountId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!customer) return { ok: false, error: 'Customer account not found' };

  let { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      current_customer_account_id: payload.customerAccountId,
      registration_number: payload.registrationNumber,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      vin: payload.vin || null,
      engine_number: payload.engineNumber || null,
      odometer_km: payload.currentMileage,
      notes: payload.notes || null,
      is_temporary: payload.isTemporary
    })
    .select('id,current_customer_account_id')
    .single();

  if (isMissingNotesColumnError(error)) {
    ({ data: vehicle, error } = await ctx.supabase
      .from('vehicles')
      .insert({
        workshop_account_id: ctx.profile.workshop_account_id,
        current_customer_account_id: payload.customerAccountId,
        registration_number: payload.registrationNumber,
        make: payload.make,
        model: payload.model,
        year: payload.year,
        vin: payload.vin || null,
        engine_number: payload.engineNumber || null,
        odometer_km: payload.currentMileage,
        is_temporary: payload.isTemporary
      })
      .select('id,current_customer_account_id')
      .single());
  }

  if (error || !vehicle) {
    return { ok: false, error: error?.message ?? 'Could not create vehicle' };
  }

  if (!vehicle.current_customer_account_id) {
    const { data: linkedVehicle, error: linkError } = await ctx.supabase
      .from('vehicles')
      .update({ current_customer_account_id: payload.customerAccountId })
      .eq('id', vehicle.id)
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .select('id,current_customer_account_id')
      .maybeSingle();

    if (linkError) {
      return {
        ok: false,
        error: `Vehicle was created but could not be linked to customer account. Please retry linking from the vehicle page. (${linkError.message})`
      };
    }

    if (!linkedVehicle?.current_customer_account_id) {
      return {
        ok: false,
        error:
          'Vehicle was created but is still not linked to this customer account. Please open the vehicle and link it manually.'
      };
    }
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/customers/${payload.customerAccountId}`);
  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath('/customer/dashboard');
  return { ok: true, message: 'Vehicle added.', vehicleId: vehicle.id };
}

export async function deleteWorkshopVehicle(input: {
  vehicleId: string;
  customerAccountId?: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = z
    .object({
      vehicleId: z.string().uuid(),
      customerAccountId: z.string().uuid().optional()
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vehicle id'
    };
  }

  const payload = parsed.data;
  const admin = createAdminClient();

  const { data: vehicle, error: vehicleError } = await admin
    .from('vehicles')
    .select('id,current_customer_account_id,workshop_account_id')
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return { ok: false, error: vehicleError?.message ?? 'Vehicle not found' };
  }

  const { error: deleteError } = await admin
    .from('vehicles')
    .delete()
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);
  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${payload.vehicleId}`);
  if (payload.customerAccountId) {
    revalidatePath(`/workshop/customers/${payload.customerAccountId}`);
  }
  if (vehicle.current_customer_account_id) {
    revalidatePath(`/customer/vehicles/${payload.vehicleId}`);
  }
  revalidatePath('/customer/dashboard');

  return { ok: true, message: 'Vehicle deleted.' };
}

export async function archiveWorkshopTemporaryVehicle(input: {
  vehicleId: string;
  customerAccountId?: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = z
    .object({
      vehicleId: z.string().uuid(),
      customerAccountId: z.string().uuid().optional()
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vehicle id'
    };
  }

  const payload = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: vehicle, error: vehicleError } = await admin
    .from('vehicles')
    .select('id,current_customer_account_id,is_temporary,workshop_account_id')
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return { ok: false, error: vehicleError?.message ?? 'Vehicle not found' };
  }

  if (!vehicle.is_temporary) {
    return { ok: false, error: 'Only temporary vehicles can be archived.' };
  }

  const { error: archiveError } = await admin
    .from('vehicles')
    .update({ archived_at: now, status: 'completed' })
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);
  if (archiveError) {
    return { ok: false, error: archiveError.message };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${payload.vehicleId}`);
  if (payload.customerAccountId) {
    revalidatePath(`/workshop/customers/${payload.customerAccountId}`);
  }
  if (vehicle.current_customer_account_id) {
    revalidatePath(`/customer/vehicles/${payload.vehicleId}`);
    revalidatePath('/customer/vehicles');
  }
  revalidatePath('/customer/dashboard');
  revalidatePath('/customer/profile/usage');

  return { ok: true, message: 'Temporary vehicle archived.' };
}

export async function updateWorkshopVehicleInfo(
  input: unknown
): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = workshopVehicleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data'
    };
  }

  const payload = parsed.data;

  let { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update({
      registration_number: payload.registrationNumber,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      vin: payload.vin || null,
      engine_number: payload.engineNumber || null,
      odometer_km: payload.currentMileage,
      notes: payload.notes || null,
      is_temporary: payload.isTemporary
    })
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,current_customer_account_id')
    .maybeSingle();

  if (isMissingNotesColumnError(error)) {
    ({ data: vehicle, error } = await ctx.supabase
      .from('vehicles')
      .update({
        registration_number: payload.registrationNumber,
        make: payload.make,
        model: payload.model,
        year: payload.year,
        vin: payload.vin || null,
        engine_number: payload.engineNumber || null,
        odometer_km: payload.currentMileage,
        is_temporary: payload.isTemporary
      })
      .eq('id', payload.vehicleId)
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .select('id,current_customer_account_id')
      .maybeSingle());
  }

  if (error || !vehicle) {
    return { ok: false, error: error?.message ?? 'Could not update vehicle' };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${payload.vehicleId}`);
  revalidatePath(`/customer/vehicles/${payload.vehicleId}`);
  if (vehicle.current_customer_account_id) {
    revalidatePath(
      `/workshop/customers/${vehicle.current_customer_account_id}`
    );
  }
  return { ok: true, message: 'Vehicle updated.' };
}

async function removeCustomerAccountById(input: {
  customerAccountId: string;
  workshopAccountId: string;
}): Promise<Result> {
  const parsed = z
    .object({
      customerAccountId: z.string().uuid(),
      workshopAccountId: z.string().uuid()
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid customer account id'
    };
  }

  const payload = parsed.data;
  const admin = createAdminClient();

  const { data: account, error: accountError } = await admin
    .from('customer_accounts')
    .select('id')
    .eq('id', payload.customerAccountId)
    .eq('workshop_account_id', payload.workshopAccountId)
    .maybeSingle();

  if (accountError || !account) {
    return {
      ok: false,
      error: accountError?.message ?? 'Customer account not found'
    };
  }

  const { error: unlinkVehiclesError } = await admin
    .from('vehicles')
    .update({ current_customer_account_id: null })
    .eq('workshop_account_id', payload.workshopAccountId)
    .eq('current_customer_account_id', payload.customerAccountId);

  if (unlinkVehiclesError) {
    return { ok: false, error: unlinkVehiclesError.message };
  }

  const { error: membershipsDeleteError } = await admin
    .from('customer_users')
    .delete()
    .eq('customer_account_id', payload.customerAccountId);

  if (membershipsDeleteError) {
    return { ok: false, error: membershipsDeleteError.message };
  }

  const { error: deleteAccountError } = await admin
    .from('customer_accounts')
    .delete()
    .eq('id', payload.customerAccountId)
    .eq('workshop_account_id', payload.workshopAccountId);

  if (deleteAccountError) {
    return {
      ok: false,
      error: `Could not remove customer account. Please remove linked records first. (${deleteAccountError.message})`
    };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/customers/${payload.customerAccountId}`);
  revalidatePath('/customer/dashboard');
  revalidatePath('/customer/profile');

  return { ok: true, message: 'Customer account removed.' };
}

export async function removeWorkshopCustomerAccount(input: {
  customerAccountId: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  return removeCustomerAccountById({
    customerAccountId: input.customerAccountId,
    workshopAccountId: ctx.profile.workshop_account_id
  });
}

export async function removeMyCustomerAccount(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Unauthorized' };

  const { data: membership, error: membershipError } = await supabase
    .from('customer_users')
    .select('customer_account_id,customer_accounts(workshop_account_id)')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (membershipError || !membership?.customer_account_id) {
    return {
      ok: false,
      error: membershipError?.message ?? 'Customer account not found'
    };
  }

  const linkedAccount = Array.isArray(membership.customer_accounts)
    ? membership.customer_accounts[0]
    : membership.customer_accounts;
  const workshopAccountId = linkedAccount?.workshop_account_id;
  if (!workshopAccountId) {
    return {
      ok: false,
      error: 'Customer account is not linked to a workshop account'
    };
  }

  return removeCustomerAccountById({
    customerAccountId: membership.customer_account_id,
    workshopAccountId
  });
}

export async function createQuote(input: {
  vehicleId: string;
  totalCents: number;
  notes?: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId);
  if (!vehicle?.current_customer_account_id)
    return { ok: false, error: 'Vehicle not found' };

  const { error } = await ctx.supabase.from('quotes').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    total_cents: input.totalCents,
    subtotal_cents: input.totalCents,
    notes: input.notes ?? null,
    status: 'sent'
  });
  if (error) return { ok: false, error: error.message };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'quote_created',
    title: 'Quote created',
    description: input.notes ?? null,
    importance: 'info',
    metadata: {}
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Quote created.' };
}

export async function createInvoice(input: {
  vehicleId: string;
  totalCents: number;
  subject?: string;
  notes?: string;
  dueDate?: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId);
  if (!vehicle?.current_customer_account_id)
    return { ok: false, error: 'Vehicle not found' };

  const { data: invoice, error } = await ctx.supabase
    .from('invoices')
    .insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: vehicle.id,
      total_cents: input.totalCents,
      due_date: input.dueDate || null,
      status: 'sent',
      payment_status: 'unpaid',
      subject: input.subject || null,
      notes: input.notes || null
    })
    .select('id')
    .single();
  if (error || !invoice)
    return { ok: false, error: error?.message ?? 'Unable to create invoice' };

  const appliedCredits = await applyWorkshopCustomerCreditsToInvoice({
    supabase: ctx.supabase,
    workshopAccountId: vehicle.workshop_account_id,
    customerAccountId: vehicle.current_customer_account_id,
    invoiceId: invoice.id,
    maxApplyCents: input.totalCents,
    actorProfileId: ctx.profile.id
  });
  const balanceDueCents = Math.max(input.totalCents - appliedCredits, 0);
  const paymentStatus =
    balanceDueCents <= 0 ? 'paid' : appliedCredits > 0 ? 'partial' : 'unpaid';

  await ctx.supabase
    .from('invoices')
    .update({
      amount_paid_cents: appliedCredits,
      balance_due_cents: balanceDueCents,
      payment_status: paymentStatus
    })
    .eq('id', invoice.id)
    .eq('workshop_account_id', vehicle.workshop_account_id);

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'invoice_created',
    title: input.subject?.trim() || 'Invoice issued',
    description: input.notes || null,
    importance: 'warning',
    metadata: { invoice_id: invoice.id, credits_auto_applied_cents: appliedCredits }
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Invoice created.' };
}

export async function updateInvoicePaymentStatus(input: {
  invoiceId: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paymentMethod?: string | null;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const normalizedPaymentMethod = (input.paymentMethod ?? '').trim();

  if (input.paymentStatus === 'paid' && !normalizedPaymentMethod) {
    return { ok: false, error: 'Please select how the invoice was paid.' };
  }

  const { data, error } = await ctx.supabase
    .from('invoices')
    .update({
      payment_status: input.paymentStatus,
      payment_method: normalizedPaymentMethod || null
    })
    .eq('id', input.invoiceId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('vehicle_id,customer_account_id,workshop_account_id,total_cents,updated_at')
    .maybeSingle();

  if (error || !data)
    return { ok: false, error: error?.message ?? 'Could not update invoice' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: data.workshop_account_id,
    customer_account_id: data.customer_account_id,
    vehicle_id: data.vehicle_id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'payment_status_changed',
    title: `Payment ${input.paymentStatus}`,
    importance: input.paymentStatus === 'paid' ? 'info' : 'warning',
    metadata: {
      invoice_id: input.invoiceId,
      payment_method: normalizedPaymentMethod || null
    }
  });

  await syncInvoiceIncomeEntry(ctx.supabase, {
    workshopAccountId: data.workshop_account_id,
    invoiceId: input.invoiceId,
    paymentStatus: input.paymentStatus,
    paymentMethod: normalizedPaymentMethod || null,
    totalCents: Number(data.total_cents ?? 0),
    occurredOnIso: data.updated_at,
    actorId: ctx.profile.id
  });

  revalidatePath(`/workshop/vehicles/${data.vehicle_id}`);
  revalidatePath(`/customer/vehicles/${data.vehicle_id}`);
  return { ok: true };
}

export async function createRecommendation(input: {
  vehicleId: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high';
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId);
  if (!vehicle?.current_customer_account_id)
    return { ok: false, error: 'Vehicle not found' };

  const { error } = await ctx.supabase.from('recommendations').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    title: input.title,
    description: input.description ?? null,
    severity: input.severity,
    status: 'open'
  });
  if (error) return { ok: false, error: error.message };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'recommendation_added',
    title: input.title,
    description: input.description ?? null,
    importance: input.severity === 'high' ? 'urgent' : 'warning',
    metadata: {}
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}

export async function updateServiceJobStatus(input: {
  jobId: string;
  status:
    | 'open'
    | 'awaiting_approval'
    | 'in_progress'
    | 'completed'
    | 'cancelled';
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: job, error } = await ctx.supabase
    .from('service_jobs')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.jobId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('vehicle_id,customer_account_id,workshop_account_id')
    .maybeSingle();

  if (error || !job)
    return { ok: false, error: error?.message ?? 'Could not update job' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: job.workshop_account_id,
    customer_account_id: job.customer_account_id,
    vehicle_id: job.vehicle_id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'job_status_changed',
    title: `Job status ${input.status}`,
    importance: input.status === 'cancelled' ? 'urgent' : 'info',
    metadata: {}
  });

  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function updateWorkRequestStatus(input: {
  workRequestId: string;
  status: WorkRequestStatus;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!WORK_REQUEST_STATUSES.includes(input.status))
    return { ok: false, error: 'Invalid status.' };

  const { data: request, error } = await ctx.supabase
    .from('work_requests')
    .update({ status: input.status })
    .eq('id', input.workRequestId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select(
      'id,vehicle_id,customer_account_id,workshop_account_id,request_type,status'
    )
    .maybeSingle();

  if (error || !request)
    return {
      ok: false,
      error: error?.message ?? 'Could not update work request status'
    };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: request.workshop_account_id,
    customer_account_id: request.customer_account_id,
    vehicle_id: request.vehicle_id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'job_status_changed',
    title: `Work request ${request.request_type} status: ${request.status}`,
    importance:
      request.status === 'cancelled'
        ? 'urgent'
        : request.status === 'delivered'
          ? 'info'
          : 'warning',
    metadata: {
      work_request_id: request.id,
      request_type: request.request_type,
      status: request.status
    }
  });

  const customerHref = `/customer/vehicles/${request.vehicle_id}`;

  await ctx.supabase.rpc('push_notification', {
    p_workshop_account_id: request.workshop_account_id,
    p_to_customer_account_id: request.customer_account_id,
    p_kind: 'request',
    p_title: 'Work request update',
    p_body: `Your ${request.request_type} request is now ${request.status.replaceAll('_', ' ')}.`,
    p_href: customerHref,
    p_data: {
      work_request_id: request.id,
      status: request.status,
      request_type: request.request_type
    }
  });

  await dispatchRecentCustomerNotifications({
    customerAccountId: request.customer_account_id,
    kind: 'request',
    href: customerHref
  });

  revalidatePath(`/workshop/work-requests`);
  revalidatePath(`/workshop/work-requests/${request.id}`);
  revalidatePath(`/workshop/vehicles/${request.vehicle_id}`);
  revalidatePath(`/customer/vehicles/${request.vehicle_id}`);
  return { ok: true, message: 'Work request status updated.' };
}

export async function updateVehicleServiceReminders(input: {
  vehicleId: string;
  odometerKm?: number;
  nextServiceKm?: number;
  nextServiceDate?: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: currentVehicle } = await ctx.supabase
    .from('vehicles')
    .select('odometer_km')
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!currentVehicle) return { ok: false, error: 'Vehicle not found' };

  const currentMileage = currentVehicle.odometer_km ?? 0;
  if (
    typeof input.odometerKm === 'number' &&
    input.odometerKm < currentMileage
  ) {
    return {
      ok: false,
      error: `Mileage must be at least ${currentMileage.toLocaleString()} km.`
    };
  }

  const patch = {
    odometer_km: input.odometerKm ?? currentMileage,
    next_service_km: input.nextServiceKm ?? null,
    next_service_date: input.nextServiceDate || null
  };

  const { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update(patch)
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,current_customer_account_id,workshop_account_id')
    .maybeSingle();

  if (error || !vehicle?.current_customer_account_id)
    return { ok: false, error: error?.message ?? 'Vehicle not found' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'note',
    title: 'Service reminders updated',
    importance: 'info',
    metadata: patch
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}

export async function verifyVehicle(input: {
  vehicleId: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update({ status: 'verified' })
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select(
      'id,current_customer_account_id,workshop_account_id,registration_number'
    )
    .maybeSingle();

  if (error || !vehicle?.current_customer_account_id)
    return { ok: false, error: error?.message ?? 'Vehicle not found' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: ctx.profile.role,
    event_type: 'note',
    title: 'Vehicle verified',
    importance: 'info',
    metadata: { status: 'verified' }
  });

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Vehicle verified' };
}
