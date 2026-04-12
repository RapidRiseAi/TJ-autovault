import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import {
  dispatchNotificationEmailsNow,
  dispatchRecentCustomerNotifications
} from '@/lib/email/dispatch-now';
import {
  buildFinancialDocumentPdf,
  computeFinancialLineItems,
  financialDocumentPayloadSchema
} from '@/lib/workshop/financial-documents';
import {
  addDaysToIsoDate,
  getNextDocumentReference
} from '@/lib/workshop/document-references';

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const code =
    'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  const message =
    'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const combined = `${code} ${message}`.toLowerCase();

  return (
    /column .* does not exist/i.test(message) ||
    combined.includes('schema cache') ||
    combined.includes('postgrest') ||
    combined.includes("could not find the '")
  );
}

function extractNotificationId(payload: unknown): string | null {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return null;

  const candidate = (payload as { id?: unknown }).id;
  return typeof candidate === 'string' ? candidate : null;
}

async function dispatchFinancialNotificationEmail(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workshopAccountId: string;
  customerAccountId: string;
  kind: 'quote' | 'invoice';
  title: string;
  body: string;
  href: string;
  data: Record<string, unknown>;
}) {
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: existingNotification } = await input.supabase
    .from('notifications')
    .select('id,data')
    .eq('to_customer_account_id', input.customerAccountId)
    .eq('kind', input.kind)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existingNotification?.id) {
    const { data: createdNotification, error: createNotificationError } =
      await input.supabase.rpc('push_notification', {
        p_workshop_account_id: input.workshopAccountId,
        p_to_customer_account_id: input.customerAccountId,
        p_kind: input.kind,
        p_title: input.title,
        p_body: input.body,
        p_href: input.href,
        p_data: input.data
      });

    if (createNotificationError) {
      await dispatchRecentCustomerNotifications({
        customerAccountId: input.customerAccountId,
        kind: input.kind
      });
      return;
    }

    const createdNotificationId = extractNotificationId(createdNotification);
    if (createdNotificationId) {
      await dispatchNotificationEmailsNow([createdNotificationId]);
      return;
    }

    await dispatchRecentCustomerNotifications({
      customerAccountId: input.customerAccountId,
      kind: input.kind
    });
    return;
  }

  await input.supabase
    .from('notifications')
    .update({
      title: input.title,
      body: input.body,
      href: input.href,
      data: {
        ...((existingNotification.data as Record<string, unknown> | null) ??
          {}),
        ...input.data
      }
    })
    .eq('id', existingNotification.id);

  await dispatchNotificationEmailsNow([existingNotification.id]);
}

async function applyAvailableCustomerCredits(params: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  workshopAccountId: string;
  customerAccountId: string;
  vehicleId: string;
  invoiceId: string;
  maxApplyCents: number;
  actorProfileId: string;
}) {
  if (params.maxApplyCents <= 0)
    return {
      appliedTotal: 0,
      applications: [] as Array<{
        amountCents: number;
        noteReference: string | null;
        noteType: 'credit_note' | 'manual_credit';
      }>
    };

  const enhancedCreditRows = await params.adminSupabase
    .from('customer_credit_ledger')
    .select(
      'id,remaining_cents,source_type,source_id,description,apply_scope,vehicle_id,apply_once,note_reference'
    )
    .eq('workshop_account_id', params.workshopAccountId)
    .eq('customer_account_id', params.customerAccountId)
    .gt('remaining_cents', 0)
    .is('consumed_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  const { data: creditRows, error: creditsError } =
    enhancedCreditRows.error && isMissingColumnError(enhancedCreditRows.error)
      ? await params.adminSupabase
          .from('customer_credit_ledger')
          .select('id,remaining_cents,source_type,source_id,description')
          .eq('workshop_account_id', params.workshopAccountId)
          .eq('customer_account_id', params.customerAccountId)
          .gt('remaining_cents', 0)
          .order('created_at', { ascending: true })
          .limit(200)
      : enhancedCreditRows;

  if (creditsError || !creditRows?.length)
    return { appliedTotal: 0, applications: [] };

  let remainingToApply = params.maxApplyCents;
  let appliedTotal = 0;
  const applications: Array<{
    amountCents: number;
    noteReference: string | null;
    noteType: 'credit_note' | 'manual_credit';
  }> = [];

  for (const row of creditRows) {
    if (remainingToApply <= 0) break;
    const applyScope =
      'apply_scope' in row && row.apply_scope === 'vehicle'
        ? 'vehicle'
        : 'customer';
    const rowVehicleId =
      'vehicle_id' in row && typeof row.vehicle_id === 'string'
        ? row.vehicle_id
        : null;
    if (applyScope === 'vehicle' && rowVehicleId !== params.vehicleId) continue;

    const available = Number(row.remaining_cents ?? 0);
    const applyNow = Math.min(available, remainingToApply);
    if (applyNow <= 0) continue;
    const applyOnce = 'apply_once' in row ? Boolean(row.apply_once) : false;
    const nextRemaining = applyOnce ? 0 : available - applyNow;

    const enhancedLedgerUpdate = await params.adminSupabase
      .from('customer_credit_ledger')
      .update({
        remaining_cents: nextRemaining,
        consumed_at: applyOnce ? new Date().toISOString() : null
      })
      .eq('id', row.id)
      .eq('workshop_account_id', params.workshopAccountId);
    const { error: updateLedgerError } =
      enhancedLedgerUpdate.error &&
      isMissingColumnError(enhancedLedgerUpdate.error)
        ? await params.adminSupabase
            .from('customer_credit_ledger')
            .update({ remaining_cents: nextRemaining })
            .eq('id', row.id)
            .eq('workshop_account_id', params.workshopAccountId)
        : enhancedLedgerUpdate;

    if (updateLedgerError) continue;

    await params.adminSupabase.from('invoice_credit_applications').insert({
      workshop_account_id: params.workshopAccountId,
      customer_account_id: params.customerAccountId,
      invoice_id: params.invoiceId,
      ledger_entry_id: row.id,
      amount_cents: applyNow
    });

    await params.adminSupabase.from('customer_credit_ledger').insert({
      workshop_account_id: params.workshopAccountId,
      customer_account_id: params.customerAccountId,
      source_type: 'credit_application',
      source_id: params.invoiceId,
      description: `Applied to invoice ${params.invoiceId.slice(0, 8).toUpperCase()}`,
      delta_cents: -applyNow,
      remaining_cents: 0,
      created_by: params.actorProfileId
    });
    if (applyOnce && available > applyNow) {
      await params.adminSupabase.from('customer_credit_ledger').insert({
        workshop_account_id: params.workshopAccountId,
        customer_account_id: params.customerAccountId,
        source_type: 'credit_application',
        source_id: params.invoiceId,
        description: `Unused carry-forward expired from ${(('note_reference' in row ? row.note_reference : null) as string | null) ?? row.description ?? 'credit note'}`,
        delta_cents: -(available - applyNow),
        remaining_cents: 0,
        created_by: params.actorProfileId
      });
    }

    remainingToApply -= applyNow;
    appliedTotal += applyNow;
    applications.push({
      amountCents: applyNow,
      noteReference:
        'note_reference' in row && typeof row.note_reference === 'string'
          ? row.note_reference
          : null,
      noteType:
        row.source_type === 'credit_note' ? 'credit_note' : 'manual_credit'
    });
  }

  return { appliedTotal, applications };
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind !== 'quote' && kind !== 'invoice') {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id')
    .eq('id', user.id)
    .in('role', ['admin', 'technician'])
    .maybeSingle();

  if (!profile?.workshop_account_id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const referenceNumber = await getNextDocumentReference({
    supabase,
    workshopAccountId: profile.workshop_account_id,
    kind
  });

  const vehicleId = request.nextUrl.searchParams.get('vehicleId');
  const customerAccountId =
    request.nextUrl.searchParams.get('customerAccountId');
  const quoteId = request.nextUrl.searchParams.get('quoteId');

  if (kind !== 'invoice' || !vehicleId || !customerAccountId) {
    return NextResponse.json({ referenceNumber });
  }

  let quoteTemplate: {
    id: string;
    quote_number: string | null;
    subject: string | null;
    notes: string | null;
    order_number: string | null;
    lineItems: Array<{
      description: string;
      qty: number;
      unit_price_cents: number;
      discount_type: 'none' | 'percent' | 'fixed';
      discount_value: number;
      tax_rate: number;
      category: string | null;
    }>;
  } | null = null;

  if (quoteId) {
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id,quote_number,subject,notes,order_number')
      .eq('id', quoteId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .maybeSingle();

    if (!quoteError && quote) {
      const enhancedQuoteItems = await supabase
        .from('quote_items')
        .select(
          'description,qty,unit_price_cents,discount_type,discount_value,tax_rate,category,sort_order'
        )
        .eq('quote_id', quote.id)
        .order('sort_order', { ascending: true });

      const quoteItems =
        enhancedQuoteItems.error &&
        isMissingColumnError(enhancedQuoteItems.error)
          ? (
              await supabase
                .from('quote_items')
                .select('description,qty,unit_price_cents')
                .eq('quote_id', quote.id)
            ).data?.map((item) => ({
              ...item,
              discount_type: 'none' as const,
              discount_value: 0,
              tax_rate: 0,
              category: null
            }))
          : enhancedQuoteItems.data;

      quoteTemplate = {
        id: quote.id,
        quote_number: quote.quote_number,
        subject: quote.subject,
        notes: quote.notes,
        order_number: quote.order_number ?? null,
        lineItems: (quoteItems ?? []).map((item) => ({
          description: item.description,
          qty: item.qty,
          unit_price_cents: item.unit_price_cents,
          discount_type: item.discount_type ?? 'none',
          discount_value: item.discount_value ?? 0,
          tax_rate: item.tax_rate ?? 0,
          category: item.category ?? null
        }))
      };
    }
  }

  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .select('id,quote_number,status,created_at,total_cents')
    .eq('workshop_account_id', profile.workshop_account_id)
    .eq('vehicle_id', vehicleId)
    .eq('customer_account_id', customerAccountId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (quotesError) {
    return NextResponse.json({ error: quotesError.message }, { status: 400 });
  }

  return NextResponse.json({
    referenceNumber,
    quotes: quotes ?? [],
    quoteTemplate
  });
}

export async function POST(request: NextRequest) {
  try {
    const payloadParsed = financialDocumentPayloadSchema.safeParse(
      await request.json()
    );
    if (!payloadParsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const payload = payloadParsed.data;
    const oneTimeClient = payload.oneTimeClient;
    const supabase = await createClient();
    const admin = createAdminClient();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role,workshop_account_id')
      .eq('id', user.id)
      .in('role', ['admin', 'technician'])
      .maybeSingle();

    if (!profile?.workshop_account_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: vehicle } = await supabase
      .from('vehicles')
      .select(
        'id,registration_number,make,model,vin,odometer_km,current_customer_account_id,workshop_account_id'
      )
      .eq('id', payload.vehicleId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle();

    let workshop: {
      id: string;
      name: string;
      contact_email?: string | null;
      contact_phone?: string | null;
      billing_address?: string | null;
      tax_number?: string | null;
      bank_name?: string | null;
      bank_account_number?: string | null;
      bank_branch_code?: string | null;
      co_reg_number?: string | null;
      bank_account_name?: string | null;
      bank_account_type?: string | null;
      invoice_footer?: string | null;
    } | null = null;

    const branding = await supabase
      .from('workshop_branding_settings')
      .select('logo_url,primary_color')
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle();

    const enhancedWorkshop = await supabase
      .from('workshop_accounts')
      .select(
        'id,name,contact_email,contact_phone,billing_address,tax_number,co_reg_number,bank_name,bank_account_name,bank_account_number,bank_account_type,bank_branch_code,invoice_footer'
      )
      .eq('id', profile.workshop_account_id)
      .maybeSingle();

    if (
      enhancedWorkshop.error &&
      isMissingColumnError(enhancedWorkshop.error)
    ) {
      const fallbackWorkshop = await supabase
        .from('workshop_accounts')
        .select('id,name,contact_email,contact_phone')
        .eq('id', profile.workshop_account_id)
        .maybeSingle();

      if (fallbackWorkshop.error) {
        return NextResponse.json(
          { error: fallbackWorkshop.error.message },
          { status: 400 }
        );
      }

      workshop = fallbackWorkshop.data
        ? {
            ...fallbackWorkshop.data,
            billing_address: null,
            tax_number: null,
            bank_name: null,
            bank_account_number: null,
            bank_branch_code: null,
            co_reg_number: null,
            bank_account_name: null,
            bank_account_type: null,
            invoice_footer: null
          }
        : null;
    } else if (enhancedWorkshop.error) {
      return NextResponse.json(
        { error: enhancedWorkshop.error.message },
        { status: 400 }
      );
    } else {
      workshop = enhancedWorkshop.data;
    }

    const resolvedCustomerId =
      payload.customerAccountId ?? vehicle?.current_customer_account_id ?? null;

    let customer: {
      id: string;
      name: string;
      linked_email?: string | null;
      auth_user_id?: string | null;
      billing_address?: string | null;
      billing_name?: string | null;
      billing_company?: string | null;
      billing_email?: string | null;
      billing_phone?: string | null;
      billing_tax_number?: string | null;
    } | null = null;

    if (resolvedCustomerId) {
      const enhancedCustomer = await supabase
        .from('customer_accounts')
        .select(
          'id,name,linked_email,auth_user_id,billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number'
        )
        .eq('id', resolvedCustomerId)
        .eq('workshop_account_id', profile.workshop_account_id)
        .maybeSingle();

      if (
        enhancedCustomer.error &&
        isMissingColumnError(enhancedCustomer.error)
      ) {
        const fallbackCustomer = await supabase
          .from('customer_accounts')
          .select('id,name')
          .eq('id', resolvedCustomerId)
          .eq('workshop_account_id', profile.workshop_account_id)
          .maybeSingle();

        if (fallbackCustomer.error) {
          return NextResponse.json(
            { error: fallbackCustomer.error.message },
            { status: 400 }
          );
        }

        customer = fallbackCustomer.data
          ? {
              ...fallbackCustomer.data,
              billing_address: null,
              billing_name: null,
              billing_company: null,
              billing_email: null,
              billing_phone: null,
              billing_tax_number: null
            }
          : null;
      } else if (enhancedCustomer.error) {
        return NextResponse.json(
          { error: enhancedCustomer.error.message },
          { status: 400 }
        );
      } else {
        customer = enhancedCustomer.data;
      }
    }

    if (!vehicle || !customer || !workshop) {
      return NextResponse.json(
        { error: 'Vehicle, customer, or workshop not found' },
        { status: 404 }
      );
    }

    let linkedQuoteId: string | null = null;
    let linkedQuoteNumber: string | null = null;
    if (payload.kind === 'invoice' && payload.quoteId) {
      const { data: linkedQuote, error: linkedQuoteError } = await supabase
        .from('quotes')
        .select('id,quote_number')
        .eq('id', payload.quoteId)
        .eq('vehicle_id', vehicle.id)
        .eq('customer_account_id', customer.id)
        .eq('workshop_account_id', profile.workshop_account_id)
        .maybeSingle();

      if (linkedQuoteError || !linkedQuote) {
        return NextResponse.json(
          {
            error:
              linkedQuoteError?.message ?? 'Invalid quote selected for invoice.'
          },
          { status: 400 }
        );
      }

      linkedQuoteId = linkedQuote.id;
      linkedQuoteNumber = linkedQuote.quote_number ?? null;
    }

    const { computed, totals } = computeFinancialLineItems(payload.lineItems);

    const issueDate =
      payload.issueDate || new Date().toISOString().slice(0, 10);
    const referenceNumber =
      payload.referenceNumber?.trim() ||
      (await getNextDocumentReference({
        supabase,
        workshopAccountId: profile.workshop_account_id,
        kind: payload.kind
      }));

    const dueDate =
      payload.kind === 'invoice'
        ? payload.dueDate || addDaysToIsoDate(issueDate, 7)
        : null;
    const expiryDate =
      payload.kind === 'quote'
        ? payload.expiryDate || addDaysToIsoDate(issueDate, 7)
        : null;

    const workshopSnapshot = {
      name: workshop.name,
      contact_email: workshop.contact_email,
      contact_phone: workshop.contact_phone,
      billing_address: workshop.billing_address,
      tax_number: workshop.tax_number,
      bank_name: workshop.bank_name,
      bank_account_number: workshop.bank_account_number,
      bank_branch_code: workshop.bank_branch_code,
      co_reg_number: workshop.co_reg_number,
      bank_account_name: workshop.bank_account_name,
      bank_account_type: workshop.bank_account_type,
      invoice_footer: workshop.invoice_footer
    };

    const customerSnapshot = oneTimeClient
      ? {
          id: null,
          name: oneTimeClient.customerName,
          billing_name: oneTimeClient.billingName ?? oneTimeClient.customerName,
          billing_company: oneTimeClient.billingCompany ?? null,
          billing_address: oneTimeClient.billingAddress ?? null,
          billing_email:
            oneTimeClient.billingEmail ??
            oneTimeClient.notificationEmail ??
            null,
          billing_phone: oneTimeClient.billingPhone ?? null,
          billing_tax_number: null
        }
      : {
          id: customer.id,
          name: customer.name,
          billing_name: customer.billing_name,
          billing_company: customer.billing_company,
          billing_address: customer.billing_address,
          billing_email: customer.billing_email,
          billing_phone: customer.billing_phone,
          billing_tax_number: customer.billing_tax_number
        };

    let linkedId: string;
    let invoiceAmountPaidCents = 0;
    let invoiceBalanceDueCents = totals.totalCents;
    let invoiceNetTotalCents = totals.totalCents;
    let autoCreditApplications: Array<{
      amountCents: number;
      noteReference: string | null;
      noteType: 'credit_note' | 'manual_credit';
    }> = [];

    if (payload.kind === 'quote') {
      const enhancedQuote = await supabase
        .from('quotes')
        .insert({
          workshop_account_id: profile.workshop_account_id,
          customer_account_id: customer.id,
          vehicle_id: vehicle.id,
          status: 'sent',
          quote_number: referenceNumber,
          issue_date: issueDate,
          expiry_date: expiryDate,
          notes: payload.notes || null,
          order_number: payload.orderNumber || null,
          subject: payload.subject,
          currency_code: payload.currencyCode,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          discount_cents: totals.discountCents,
          total_cents: totals.totalCents,
          workshop_snapshot: workshopSnapshot,
          customer_snapshot: customerSnapshot
        })
        .select('id')
        .single();

      const quote =
        enhancedQuote.error && isMissingColumnError(enhancedQuote.error)
          ? await supabase
              .from('quotes')
              .insert({
                workshop_account_id: profile.workshop_account_id,
                customer_account_id: customer.id,
                vehicle_id: vehicle.id,
                status: 'sent',
                quote_number: referenceNumber,
                notes: payload.notes || null,
                order_number: payload.orderNumber || null,
                total_cents: totals.totalCents,
                subtotal_cents: totals.subtotalCents,
                tax_cents: totals.taxCents
              })
              .select('id')
              .single()
          : enhancedQuote;

      if (quote.error || !quote.data) {
        return NextResponse.json(
          { error: quote.error?.message ?? 'Could not create quote' },
          { status: 400 }
        );
      }

      const enhancedQuoteItems = await supabase.from('quote_items').insert(
        computed.map((item, index) => ({
          quote_id: quote.data.id,
          sort_order: index,
          description: item.description,
          qty: item.qty,
          unit_price_cents: item.unitPriceCents,
          line_total_cents: item.lineTotalCents,
          discount_type: item.discountType,
          discount_value: item.discountValue,
          discount_cents: item.discountCents,
          tax_rate: item.taxRate,
          tax_cents: item.taxCents,
          category: item.category || null
        }))
      );

      const quoteItemsError =
        enhancedQuoteItems.error &&
        isMissingColumnError(enhancedQuoteItems.error)
          ? (
              await supabase.from('quote_items').insert(
                computed.map((item) => ({
                  quote_id: quote.data.id,
                  description: item.description,
                  qty: item.qty,
                  unit_price_cents: item.unitPriceCents,
                  line_total_cents: item.lineTotalCents
                }))
              )
            ).error
          : enhancedQuoteItems.error;

      if (quoteItemsError) {
        return NextResponse.json(
          { error: quoteItemsError.message },
          { status: 400 }
        );
      }

      linkedId = quote.data.id;
    } else {
      const enhancedInvoice = await supabase
        .from('invoices')
        .insert({
          workshop_account_id: profile.workshop_account_id,
          customer_account_id: customer.id,
          vehicle_id: vehicle.id,
          status: 'sent',
          payment_status: 'unpaid',
          invoice_number: referenceNumber,
          issue_date: issueDate,
          due_date: dueDate,
          notes: payload.notes || null,
          order_number: payload.orderNumber || null,
          subject: payload.subject,
          currency_code: payload.currencyCode,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          discount_cents: totals.discountCents,
          total_cents: totals.totalCents,
          amount_paid_cents: 0,
          balance_due_cents: totals.totalCents,
          workshop_snapshot: workshopSnapshot,
          customer_snapshot: customerSnapshot,
          quote_id: linkedQuoteId
        })
        .select('id')
        .single();

      const invoice =
        enhancedInvoice.error && isMissingColumnError(enhancedInvoice.error)
          ? await supabase
              .from('invoices')
              .insert({
                workshop_account_id: profile.workshop_account_id,
                customer_account_id: customer.id,
                vehicle_id: vehicle.id,
                status: 'sent',
                payment_status: 'unpaid',
                invoice_number: referenceNumber,
                due_date: dueDate,
                notes: payload.notes || null,
                order_number: payload.orderNumber || null,
                total_cents: totals.totalCents,
                quote_id: linkedQuoteId
              })
              .select('id')
              .single()
          : enhancedInvoice;

      if (invoice.error || !invoice.data) {
        return NextResponse.json(
          { error: invoice.error?.message ?? 'Could not create invoice' },
          { status: 400 }
        );
      }

      const enhancedInvoiceItems = await supabase.from('invoice_items').insert(
        computed.map((item, index) => ({
          invoice_id: invoice.data.id,
          sort_order: index,
          description: item.description,
          qty: item.qty,
          unit_price_cents: item.unitPriceCents,
          line_total_cents: item.lineTotalCents,
          discount_type: item.discountType,
          discount_value: item.discountValue,
          discount_cents: item.discountCents,
          tax_rate: item.taxRate,
          tax_cents: item.taxCents,
          category: item.category || null
        }))
      );

      const invoiceItemsError =
        enhancedInvoiceItems.error &&
        isMissingColumnError(enhancedInvoiceItems.error)
          ? (
              await supabase.from('invoice_items').insert(
                computed.map((item) => ({
                  invoice_id: invoice.data.id,
                  description: item.description,
                  qty: item.qty,
                  unit_price_cents: item.unitPriceCents,
                  line_total_cents: item.lineTotalCents
                }))
              )
            ).error
          : enhancedInvoiceItems.error;

      if (invoiceItemsError) {
        return NextResponse.json(
          { error: invoiceItemsError.message },
          { status: 400 }
        );
      }

      linkedId = invoice.data.id;

      const autoCreditResult = await applyAvailableCustomerCredits({
        adminSupabase: admin,
        workshopAccountId: profile.workshop_account_id,
        customerAccountId: customer.id,
        vehicleId: vehicle.id,
        invoiceId: linkedId,
        maxApplyCents: totals.totalCents,
        actorProfileId: profile.id
      });
      const autoAppliedCredits = autoCreditResult.appliedTotal;
      autoCreditApplications = autoCreditResult.applications;

      invoiceAmountPaidCents = autoAppliedCredits;
      invoiceNetTotalCents = Math.max(
        totals.totalCents - autoAppliedCredits,
        0
      );
      invoiceBalanceDueCents = invoiceNetTotalCents;

      const paymentStatus = invoiceBalanceDueCents <= 0 ? 'paid' : 'unpaid';

      await supabase
        .from('invoices')
        .update({
          subtotal_cents: Math.max(
            totals.subtotalCents - autoAppliedCredits,
            0
          ),
          total_cents: invoiceNetTotalCents,
          amount_paid_cents: 0,
          balance_due_cents: invoiceBalanceDueCents,
          payment_status: paymentStatus
        })
        .eq('id', linkedId)
        .eq('workshop_account_id', profile.workshop_account_id);

      if (autoAppliedCredits > 0) {
        const creditLines = autoCreditResult.applications.map(
          (application, index) => ({
            invoice_id: linkedId,
            sort_order: computed.length + index,
            description:
              application.noteType === 'credit_note'
                ? `Credit note ${application.noteReference ?? 'N/A'} applied (${((application.amountCents ?? 0) / 100).toFixed(2)})`
                : `Customer account credit applied (${((application.amountCents ?? 0) / 100).toFixed(2)})`,
            qty: 1,
            unit_price_cents: -application.amountCents,
            line_total_cents: -application.amountCents,
            discount_type: 'none',
            discount_value: 0,
            discount_cents: 0,
            tax_rate: 0,
            tax_cents: 0,
            category: 'credit'
          })
        );
        const creditLineInsert = await supabase
          .from('invoice_items')
          .insert(creditLines);

        if (
          creditLineInsert.error &&
          isMissingColumnError(creditLineInsert.error)
        ) {
          await supabase.from('invoice_items').insert(
            creditLines.map((line) => ({
              invoice_id: line.invoice_id,
              description: line.description,
              qty: line.qty,
              unit_price_cents: line.unit_price_cents,
              line_total_cents: line.line_total_cents
            }))
          );
        }
      }
    }

    const pdfItems =
      payload.kind === 'invoice' && autoCreditApplications.length > 0
        ? [
            ...computed,
            ...autoCreditApplications.map((application) => ({
              description:
                application.noteType === 'credit_note'
                  ? `Credit note ${application.noteReference ?? 'N/A'} applied (${((application.amountCents ?? 0) / 100).toFixed(2)})`
                  : `Customer account credit applied (${((application.amountCents ?? 0) / 100).toFixed(2)})`,
              qty: 1,
              unitPriceCents: -application.amountCents,
              discountType: 'none' as const,
              discountValue: 0,
              taxRate: 0,
              category: 'credit',
              lineSubtotalCents: -application.amountCents,
              discountCents: 0,
              taxableCents: -application.amountCents,
              taxCents: 0,
              lineTotalCents: -application.amountCents
            }))
          ]
        : computed;

    let logoBytes: Uint8Array | undefined;
    if (branding.data?.logo_url) {
      try {
        const response = await fetch(branding.data.logo_url);
        if (response.ok) {
          logoBytes = new Uint8Array(await response.arrayBuffer());
        }
      } catch {
        logoBytes = undefined;
      }
    }

    if (!logoBytes) {
      try {
        const localLogoPath = path.join(process.cwd(), 'tj-logo.png');
        const localLogo = await readFile(localLogoPath);
        logoBytes = new Uint8Array(localLogo);
      } catch {
        logoBytes = undefined;
      }
    }

    const pdfBytes = await buildFinancialDocumentPdf({
      kind: payload.kind,
      brandColor: branding.data?.primary_color ?? undefined,
      logoBytes,
      workshop: {
        name: workshop.name,
        contactEmail: workshop.contact_email,
        contactPhone: workshop.contact_phone,
        billingAddress: workshop.billing_address,
        taxNumber: workshop.tax_number,
        bankName: workshop.bank_name,
        bankAccountNumber: workshop.bank_account_number,
        bankBranchCode: workshop.bank_branch_code,
        coRegNumber: workshop.co_reg_number,
        bankAccountName: workshop.bank_account_name,
        bankAccountType: workshop.bank_account_type,
        footer: workshop.invoice_footer
      },
      customer: {
        name: oneTimeClient?.customerName ?? customer.name,
        billingName: oneTimeClient?.billingName ?? customer.billing_name,
        billingCompany:
          oneTimeClient?.billingCompany ?? customer.billing_company,
        billingAddress:
          oneTimeClient?.billingAddress ?? customer.billing_address,
        billingEmail:
          oneTimeClient?.billingEmail ??
          oneTimeClient?.notificationEmail ??
          customer.billing_email,
        billingPhone: oneTimeClient?.billingPhone ?? customer.billing_phone,
        billingTaxNumber: customer.billing_tax_number
      },
      vehicle: {
        registrationNumber:
          oneTimeClient?.registrationNumber ?? vehicle.registration_number,
        make: oneTimeClient?.make ?? vehicle.make,
        model: oneTimeClient?.model ?? vehicle.model,
        vin: oneTimeClient?.vin ?? vehicle.vin,
        mileageKm:
          payload.kind === 'invoice' && payload.updatedMileageKm != null
            ? payload.updatedMileageKm
            : vehicle.odometer_km
      },
      subject: payload.subject,
      referenceNumber,
      quoteNumber: linkedQuoteNumber,
      orderNumber: payload.orderNumber,
      issueDate,
      dueOrExpiryDate: payload.kind === 'quote' ? expiryDate : dueDate,
      notes: payload.notes,
      currencyCode: payload.currencyCode,
      items: pdfItems,
      totals: {
        subtotalCents:
          payload.kind === 'invoice'
            ? Math.max(totals.subtotalCents - invoiceAmountPaidCents, 0)
            : totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents:
          payload.kind === 'invoice' ? invoiceNetTotalCents : totals.totalCents,
        amountPaidCents:
          payload.kind === 'invoice' ? 0 : invoiceAmountPaidCents,
        balanceDueCents:
          payload.kind === 'invoice'
            ? invoiceBalanceDueCents
            : totals.totalCents
      }
    });

    const pdfPath = `workshop/${profile.workshop_account_id}/vehicles/${vehicle.id}/${payload.kind}s/${linkedId}.pdf`;
    const { error: storageError } = await admin.storage
      .from('vehicle-files')
      .upload(pdfPath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true
      });

    if (storageError) {
      return NextResponse.json(
        { error: storageError.message },
        { status: 400 }
      );
    }

    const { data: doc, error: docError } = await supabase
      .from('vehicle_documents')
      .insert({
        workshop_account_id: profile.workshop_account_id,
        customer_account_id: customer.id,
        vehicle_id: vehicle.id,
        document_type: payload.kind,
        doc_type: payload.kind,
        storage_bucket: 'vehicle-files',
        storage_path: pdfPath,
        original_name: `${referenceNumber}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: pdfBytes.length,
        subject: payload.subject,
        importance: 'info'
      })
      .select('id')
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: docError?.message ?? 'Could not save document record' },
        { status: 400 }
      );
    }

    if (payload.kind === 'quote') {
      const quoteUpdate = await supabase
        .from('quotes')
        .update({ document_id: doc.id, pdf_storage_path: pdfPath })
        .eq('id', linkedId);

      if (quoteUpdate.error && isMissingColumnError(quoteUpdate.error)) {
        await supabase
          .from('quotes')
          .update({ document_id: doc.id })
          .eq('id', linkedId);
      }

      await supabase
        .from('vehicle_documents')
        .update({ quote_id: linkedId })
        .eq('id', doc.id);
    } else {
      const invoiceUpdate = await supabase
        .from('invoices')
        .update({ document_id: doc.id, pdf_storage_path: pdfPath })
        .eq('id', linkedId);

      if (invoiceUpdate.error && isMissingColumnError(invoiceUpdate.error)) {
        await supabase
          .from('invoices')
          .update({ document_id: doc.id })
          .eq('id', linkedId);
      }

      await supabase
        .from('vehicle_documents')
        .update({ invoice_id: linkedId })
        .eq('id', doc.id);

      if (payload.updatedMileageKm != null) {
        await supabase
          .from('vehicles')
          .update({ odometer_km: payload.updatedMileageKm })
          .eq('id', vehicle.id)
          .eq('workshop_account_id', profile.workshop_account_id);
      }
    }

    await supabase.from('vehicle_timeline_events').insert({
      workshop_account_id: profile.workshop_account_id,
      customer_account_id: customer.id,
      vehicle_id: vehicle.id,
      actor_profile_id: profile.id,
      actor_role: profile.role,
      event_type:
        payload.kind === 'quote' ? 'quote_created' : 'invoice_created',
      title: `${payload.kind === 'quote' ? 'Quote' : 'Invoice'} ${referenceNumber}`,
      description:
        payload.kind === 'invoice' && linkedQuoteNumber
          ? `${payload.subject} · Linked to quote ${linkedQuoteNumber}`
          : payload.subject,
      importance: 'info',
      metadata: {
        linked_id: linkedId,
        document_id: doc.id,
        reference_number: referenceNumber,
        ...(payload.kind === 'invoice'
          ? { invoice_id: linkedId, quote_id: linkedQuoteId }
          : { quote_id: linkedId })
      }
    });

    if (payload.sendEmailTo) {
      const safeTo = payload.sendEmailTo.trim().toLowerCase();
      const referenceLabel = payload.kind === 'quote' ? 'Quote' : 'Invoice';
      await sendEmail(
        safeTo,
        `${referenceLabel} ${referenceNumber}`,
        `<p>${referenceLabel} ${referenceNumber} from ${workshop.name} is attached.</p>`,
        {
          attachments: [
            {
              filename: `${referenceNumber}.pdf`,
              content: Buffer.from(pdfBytes)
            }
          ]
        }
      );
    }

    if (!oneTimeClient) {
      const customerHref = `/customer/vehicles/${vehicle.id}`;
      await dispatchFinancialNotificationEmail({
        supabase,
        workshopAccountId: profile.workshop_account_id,
        customerAccountId: customer.id,
        kind: payload.kind,
        title: payload.subject,
        body:
          payload.kind === 'quote'
            ? `A new quote (${referenceNumber}) is available.`
            : `A new invoice (${referenceNumber}) is available.`,
        href: customerHref,
        data: {
          vehicle_id: vehicle.id,
          linked_entity_id: linkedId,
          document_id: doc.id,
          document_type: payload.kind
        }
      });
    }

    return NextResponse.json({ ok: true, id: linkedId, documentId: doc.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not create financial document'
      },
      { status: 500 }
    );
  }
}
