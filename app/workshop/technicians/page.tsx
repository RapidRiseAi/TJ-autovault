import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function sanitizeFileName(fileName: string) {
  const [rawBase, ...rest] = fileName.trim().split('.');
  const extension = rest.length ? `.${rest.pop()?.toLowerCase()}` : '';
  const base = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
  return `${base || 'document'}${extension}`;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(cents / 100);
}

function buildStaffThreadKey(leftProfileId: string, rightProfileId: string) {
  return [leftProfileId, rightProfileId].sort().join(':');
}

async function createTechnician(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!actorProfile?.workshop_account_id || actorProfile.role !== 'admin') {
    redirect('/workshop/dashboard');
  }

  const displayName = (formData.get('displayName')?.toString() ?? '').trim();
  const email = (formData.get('email')?.toString() ?? '').trim().toLowerCase();
  const password = (formData.get('password')?.toString() ?? '').trim();

  if (!displayName || !email || password.length < 8) {
    redirect('/workshop/technicians?error=invalid_input');
  }

  const adminSupabase = createAdminClient();
  const { data: created, error: createError } =
    await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        role: 'technician'
      }
    });

  if (createError || !created.user) {
    const duplicate =
      createError?.message?.toLowerCase().includes('already') ?? false;
    redirect(
      `/workshop/technicians?error=${duplicate ? 'email_exists' : 'create_failed'}`
    );
  }

  const { error: profileError } = await adminSupabase.from('profiles').upsert({
    id: created.user.id,
    workshop_account_id: actorProfile.workshop_account_id,
    role: 'technician',
    display_name: displayName
  });

  if (profileError) {
    redirect('/workshop/technicians?error=profile_failed');
  }

  revalidatePath('/workshop/technicians');
  revalidatePath('/workshop/workshop/vehicles');
  redirect('/workshop/technicians?created=1');
}

async function updateTechnicianComp(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: actor } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!actor?.workshop_account_id || actor.role !== 'admin') redirect('/workshop/dashboard');

  const technicianId = (formData.get('technicianId')?.toString() ?? '').trim();
  const dailyWageInput = (formData.get('dailyWage')?.toString() ?? '').trim();
  const normalizedDailyWage = dailyWageInput
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
  const dailyWage = Number(normalizedDailyWage || '0');
  if (!technicianId || !Number.isFinite(dailyWage) || dailyWage < 0) {
    redirect('/workshop/technicians?error=invalid_wage');
  }

  const cents = Math.round(dailyWage * 100);
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from('profiles')
    .update({ daily_wage_cents: cents })
    .eq('id', technicianId)
    .eq('role', 'technician')
    .eq('workshop_account_id', actor.workshop_account_id);

  if (error) redirect('/workshop/technicians?error=invalid_wage');

  revalidatePath('/workshop/technicians');
  redirect('/workshop/technicians?updated=1');
}

async function createTechnicianPayout(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: actor } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!actor?.workshop_account_id || actor.role !== 'admin') redirect('/workshop/dashboard');

  const technicianId = (formData.get('technicianId')?.toString() ?? '').trim();
  const amount = Number(formData.get('amount')?.toString() ?? '0');
  const notes = (formData.get('notes')?.toString() ?? '').trim();
  const proof = formData.get('proof');

  if (!technicianId || !Number.isFinite(amount) || amount <= 0 || !(proof instanceof File) || proof.size <= 0) {
    redirect('/workshop/technicians?error=payout_invalid');
  }

  const adminSupabase = createAdminClient();
  const safeName = sanitizeFileName(proof.name || 'payment-proof');
  const proofPath = `technician-payouts/${actor.workshop_account_id}/${technicianId}/${Date.now()}-${safeName}`;
  const upload = await adminSupabase.storage.from('private-images').upload(proofPath, proof, {
    cacheControl: '3600',
    contentType: proof.type || undefined,
    upsert: false
  });

  if (upload.error) redirect('/workshop/technicians?error=payout_upload_failed');

  const amountCents = Math.round(amount * 100);
  const { error: payoutError } = await supabase.from('technician_payouts').insert({
    workshop_account_id: actor.workshop_account_id,
    technician_profile_id: technicianId,
    amount_cents: amountCents,
    proof_bucket: 'private-images',
    proof_path: proofPath,
    notes: notes || null,
    created_by: actor.id
  });

  if (payoutError) redirect('/workshop/technicians?error=payout_failed');

  await supabase.from('notifications').insert({
    workshop_account_id: actor.workshop_account_id,
    to_profile_id: technicianId,
    kind: 'system',
    title: 'Technician payment submitted',
    body: `A payment of ${formatCurrency(amountCents)} was submitted and is waiting for your confirmation.`,
    href: '/workshop/technicians'
  });

  revalidatePath('/workshop/technicians');
  redirect('/workshop/technicians?payout=1');
}

async function confirmTechnicianPayout(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const payoutId = (formData.get('payoutId')?.toString() ?? '').trim();
  if (!payoutId) redirect('/workshop/technicians?error=payout_confirm_failed');

  const { data: actor } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!actor?.workshop_account_id) redirect('/workshop/dashboard');

  const { data: payout } = await supabase
    .from('technician_payouts')
    .select('id,technician_profile_id,workshop_account_id,status')
    .eq('id', payoutId)
    .eq('workshop_account_id', actor.workshop_account_id)
    .maybeSingle();

  if (!payout || payout.status !== 'pending_confirmation') {
    redirect('/workshop/technicians?error=payout_confirm_failed');
  }

  if (payout.technician_profile_id !== actor.id) {
    redirect('/workshop/dashboard');
  }

  const { error } = await supabase
    .from('technician_payouts')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: actor.id })
    .eq('id', payout.id);

  if (error) redirect('/workshop/technicians?error=payout_confirm_failed');

  revalidatePath('/workshop/technicians');
  redirect('/workshop/technicians?payout_confirmed=1');
}

async function sendStaffMessage(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const body = (formData.get('body')?.toString() ?? '').trim();
  if (!body) redirect('/workshop/technicians?error=message_invalid');

  const { data: actor } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id,display_name,full_name')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (
    !actor?.workshop_account_id ||
    (actor.role !== 'admin' && actor.role !== 'technician')
  ) {
    redirect('/workshop/dashboard');
  }

  const adminSupabase = createAdminClient();
  const actorName = actor.display_name ?? actor.full_name ?? 'Workshop staff';
  const mode = (formData.get('mode')?.toString() ?? '').trim();

  if (mode === 'to_technician') {
    if (actor.role !== 'admin') redirect('/workshop/dashboard');

    const technicianId = (formData.get('technicianId')?.toString() ?? '').trim();
    if (!technicianId) redirect('/workshop/technicians?error=message_invalid');

    const { data: technician } = await supabase
      .from('profiles')
      .select('id,role,workshop_account_id')
      .eq('id', technicianId)
      .eq('workshop_account_id', actor.workshop_account_id)
      .maybeSingle();

    if (!technician || technician.role !== 'technician') {
      redirect('/workshop/technicians?error=message_invalid');
    }

    await adminSupabase.from('notifications').insert({
      workshop_account_id: actor.workshop_account_id,
      to_profile_id: technician.id,
      kind: 'message',
      title: `Message from ${actorName}`,
      body,
      href: '/workshop/technicians',
      data: {
        channel: 'staff_direct_message',
        sender_profile_id: actor.id,
        recipient_profile_id: technician.id,
        thread_key: buildStaffThreadKey(actor.id, technician.id)
      }
    });
  } else if (mode === 'to_workshop') {
    if (actor.role !== 'technician') redirect('/workshop/dashboard');

    const { data: admins } = await adminSupabase
      .from('profiles')
      .select('id')
      .eq('workshop_account_id', actor.workshop_account_id)
      .eq('role', 'admin');

    const adminRecipients = (admins ?? []).filter((recipient) => recipient.id !== actor.id);
    if (!adminRecipients.length) redirect('/workshop/technicians?error=message_invalid');

    await adminSupabase.from('notifications').insert(
      adminRecipients.map((recipient) => ({
        workshop_account_id: actor.workshop_account_id,
        to_profile_id: recipient.id,
        kind: 'message',
        title: `Message from ${actorName}`,
        body,
        href: '/workshop/technicians',
        data: {
          channel: 'staff_direct_message',
          sender_profile_id: actor.id,
          recipient_profile_id: recipient.id,
          thread_key: buildStaffThreadKey(actor.id, recipient.id)
        }
      }))
    );
  } else {
    redirect('/workshop/technicians?error=message_invalid');
  }

  revalidatePath('/workshop/technicians');
  redirect('/workshop/technicians?message=1');
}

async function removeTechnician(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!actorProfile?.workshop_account_id || actorProfile.role !== 'admin') {
    redirect('/workshop/dashboard');
  }

  const technicianId = (formData.get('technicianId')?.toString() ?? '').trim();
  const reason = (formData.get('reason')?.toString() ?? '').trim();
  const document = formData.get('document');

  if (!technicianId || !reason) {
    redirect('/workshop/technicians?error=remove_invalid_input');
  }

  const { data: technician } = await supabase
    .from('profiles')
    .select('id,role,display_name,full_name,workshop_account_id')
    .eq('id', technicianId)
    .eq('workshop_account_id', actorProfile.workshop_account_id)
    .maybeSingle();

  if (!technician || technician.role !== 'technician') {
    redirect('/workshop/technicians?error=remove_not_found');
  }

  const adminSupabase = createAdminClient();
  let documentPath: string | null = null;

  if (document instanceof File && document.size > 0) {
    const safeName = sanitizeFileName(document.name || 'document');
    documentPath = `technician-removals/${actorProfile.workshop_account_id}/${technician.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await adminSupabase.storage
      .from('private-images')
      .upload(documentPath, document, {
        cacheControl: '3600',
        contentType: document.type || undefined,
        upsert: false
      });

    if (uploadError) {
      redirect('/workshop/technicians?error=remove_document_upload_failed');
    }
  }

  const { error: updateError } = await adminSupabase
    .from('profiles')
    .update({ role: 'inactive_technician' })
    .eq('id', technician.id)
    .eq('workshop_account_id', actorProfile.workshop_account_id)
    .eq('role', 'technician');

  if (updateError) {
    redirect('/workshop/technicians?error=remove_failed');
  }

  await adminSupabase.from('audit_logs').insert({
    workshop_account_id: actorProfile.workshop_account_id,
    actor_profile_id: actorProfile.id,
    action: 'technician_removed',
    entity_type: 'profile',
    entity_id: technician.id,
    payload: {
      removed_technician_id: technician.id,
      removed_technician_name:
        technician.display_name ?? technician.full_name ?? 'Technician',
      reason,
      document: documentPath
        ? {
            bucket: 'private-images',
            path: documentPath
          }
        : null
    }
  });

  revalidatePath('/workshop/technicians');
  revalidatePath('/workshop/workshop/vehicles');
  redirect('/workshop/technicians?removed=1');
}

export default async function WorkshopTechniciansPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; removed?: string; updated?: string; payout?: string; payout_confirmed?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  ) {
    redirect('/customer/dashboard');
  }

  const workshopId = profile.workshop_account_id;
  const { data: techniciansRaw } = await supabase
    .from('profiles')
    .select('id,display_name,full_name,created_at,daily_wage_cents')
    .eq('workshop_account_id', workshopId)
    .eq('role', 'technician')
    .order('created_at', { ascending: true });

  const technicians = techniciansRaw ?? [];

  const techSummaries = await Promise.all(
    technicians.map(async (tech) => {
      const [
        inspection,
        jobs,
        reports,
        uploads,
        attendance,
        payouts,
        pendingPayouts
      ] = await Promise.all([
        supabase
          .from('inspection_reports')
          .select('id', { count: 'exact', head: true })
          .eq('workshop_account_id', workshopId)
          .eq('technician_profile_id', tech.id),
        supabase
          .from('job_card_assignments')
          .select('id,job_cards!inner(workshop_id)', { count: 'exact', head: true })
          .eq('technician_user_id', tech.id)
          .eq('job_cards.workshop_id', workshopId),
        supabase
          .from('job_card_events')
          .select('id,job_cards!inner(workshop_id)', { count: 'exact', head: true })
          .eq('created_by', tech.id)
          .eq('job_cards.workshop_id', workshopId),
        supabase
          .from('job_card_photos')
          .select('id,job_cards!inner(workshop_id)', { count: 'exact', head: true })
          .eq('uploaded_by', tech.id)
          .eq('job_cards.workshop_id', workshopId),
        supabase
          .from('technician_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('workshop_account_id', workshopId)
          .eq('technician_profile_id', tech.id)
          .eq('clocked_in', true),
        supabase
          .from('technician_payouts')
          .select('amount_cents,status')
          .eq('workshop_account_id', workshopId)
          .eq('technician_profile_id', tech.id),
        supabase
          .from('technician_payouts')
          .select('id,amount_cents,paid_at,status')
          .eq('workshop_account_id', workshopId)
          .eq('technician_profile_id', tech.id)
          .eq('status', 'pending_confirmation')
          .order('paid_at', { ascending: false })
      ]);

      const daysWorked = attendance.count ?? 0;
      const confirmedPaid = (payouts.data ?? [])
        .filter((item) => item.status === 'confirmed')
        .reduce((sum, item) => sum + (item.amount_cents ?? 0), 0);
      const wagesOwed = Math.max(daysWorked * (tech.daily_wage_cents ?? 0) - confirmedPaid, 0);

      return {
        id: tech.id,
        name: tech.display_name ?? tech.full_name ?? 'Technician',
        dailyWageCents: tech.daily_wage_cents ?? 0,
        inspectionReports: inspection.count ?? 0,
        jobCards: jobs.count ?? 0,
        reportsMade: reports.count ?? 0,
        uploads: uploads.count ?? 0,
        daysWorked,
        wagesOwed,
        pendingPayouts: pendingPayouts.data ?? []
      };
    })
  );

  const { data: staffDirectMessages } = await supabase
    .from('notifications')
    .select('id,to_profile_id,title,body,created_at,data')
    .eq('workshop_account_id', workshopId)
    .eq('kind', 'message')
    .order('created_at', { ascending: false })
    .limit(200);

  const params = await searchParams;

  return (
    <main className="space-y-4">
      <PageHeader
        title="Technicians"
        subtitle="Manage technicians, pay rates, history and payout confirmations."
      />

      {params.created === '1' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Technician added successfully.</p> : null}
      {params.updated === '1' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Technician pay details saved.</p> : null}
      {params.payout === '1' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Payment submitted. Technician must confirm receipt.</p> : null}
      {params.payout_confirmed === '1' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Payment confirmation recorded.</p> : null}
      {params.removed === '1' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Technician removed successfully.</p> : null}
      {params.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {params.error === 'invalid_input'
            ? 'Please enter a name, a valid email and a password with at least 8 characters.'
            : params.error === 'invalid_wage'
              ? 'Could not save daily wage. Enter a valid amount.'
              : params.error === 'payout_invalid'
                ? 'Enter a valid payment amount and upload proof of payment.'
                : params.error === 'payout_upload_failed'
                  ? 'Could not upload proof of payment.'
                  : params.error === 'payout_failed'
                    ? 'Could not submit payment.'
                    : params.error === 'payout_confirm_failed'
                      ? 'Could not confirm this payment right now.'
                      : 'Could not complete that action right now.'}
        </p>
      ) : null}

      {profile.role === 'admin' ? (
        <SectionCard className="rounded-3xl p-6">
          <h2 className="text-base font-semibold text-gray-900">Add technician</h2>
          <form action={createTechnician} className="mt-4 grid gap-4 md:grid-cols-3">
            <input name="displayName" required className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Technician name" />
            <input name="email" type="email" required spellCheck={false} autoCorrect="off" autoCapitalize="off" className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="tech@workshop.com" />
            <input name="password" type="password" minLength={8} required className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Temporary password" />
            <div className="md:col-span-3"><Button type="submit">Create technician</Button></div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard className="rounded-3xl p-6">
        <h2 className="text-base font-semibold text-gray-900">Team and history</h2>
        {techSummaries.length ? (
          <div className="mt-4 space-y-4">
            {techSummaries.map((tech) => (
              <details key={tech.id} className="group rounded-2xl border border-black/10 bg-white p-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{tech.name}</p>
                    <p className="text-xs text-gray-500">{tech.jobCards} job cards • {tech.reportsMade} reports • {tech.uploads} uploads • {tech.inspectionReports} inspections • {tech.daysWorked} days worked</p>
                    <p className="mt-1 text-sm text-gray-700">Wages owed: <span className="font-semibold">{formatCurrency(tech.wagesOwed)}</span></p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 group-open:hidden">Expand</span>
                  <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 group-open:block">Collapse</span>
                </summary>

                <div className="mt-4 border-t border-black/10 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Daily wage: {formatCurrency(tech.dailyWageCents)}</p>
                      <Link href={`/workshop/technicians/${tech.id}/timeline`} className="text-xs font-semibold text-brand-red underline-offset-4 hover:underline">Open technician timeline</Link>
                    </div>
                    {profile.role === 'admin' ? (
                      <div className="flex min-w-80 flex-col gap-2">
                        <form action={updateTechnicianComp} className="rounded-xl border border-black/10 p-3">
                          <input type="hidden" name="technicianId" value={tech.id} />
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Daily wage (ZAR)</label>
                          <div className="flex gap-2">
                            <input name="dailyWage" type="number" min="0" step="0.01" defaultValue={(tech.dailyWageCents / 100).toFixed(2)} className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
                            <Button type="submit" size="sm">Save</Button>
                          </div>
                        </form>
                        <form action={createTechnicianPayout} className="rounded-xl border border-black/10 p-3">
                          <input type="hidden" name="technicianId" value={tech.id} />
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Pay technician (requires proof)</label>
                          <input name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" className="mb-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
                          <input name="proof" type="file" required className="mb-2 w-full rounded-xl border border-black/15 px-3 py-2 text-xs" />
                          <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" name="notes" rows={2} placeholder="Optional internal note" className="mb-2 w-full rounded-xl border border-black/15 px-3 py-2 text-xs" />
                          <Button type="submit" size="sm">Submit payment</Button>
                        </form>
                      </div>
                    ) : null}
                  </div>

                  {tech.pendingPayouts.length ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">Pending payout confirmations</p>
                      <div className="mt-2 space-y-2">
                        {tech.pendingPayouts.map((pending: { id: string; amount_cents: number; paid_at: string }) => (
                          <form key={pending.id} action={confirmTechnicianPayout} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
                            <input type="hidden" name="payoutId" value={pending.id} />
                            <p className="text-sm text-gray-700">{formatCurrency(pending.amount_cents)} paid on {new Date(pending.paid_at).toLocaleDateString('en-ZA')}</p>
                            {profile.id === tech.id ? <Button type="submit" size="sm">Confirm received</Button> : null}
                          </form>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 rounded-xl border border-black/10 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">Staff messages</p>
                    <div className="mt-2 space-y-1">
                      {(staffDirectMessages ?? [])
                        .filter((item) => {
                          const data = (item.data ?? {}) as { channel?: string; thread_key?: string };
                          if (data.channel !== 'staff_direct_message' || !data.thread_key) return false;
                          return data.thread_key.includes(tech.id);
                        })
                        .slice(0, 3)
                        .map((item) => (
                          <div key={item.id} className="rounded-lg border border-black/10 bg-white px-3 py-2">
                            <p className="text-xs font-semibold text-gray-700">{item.title}</p>
                            <p className="text-xs text-gray-600">{item.body}</p>
                          </div>
                        ))}
                    </div>

                    {profile.role === 'admin' ? (
                      <form action={sendStaffMessage} className="mt-3 flex flex-wrap gap-2">
                        <input type="hidden" name="mode" value="to_technician" />
                        <input type="hidden" name="technicianId" value={tech.id} />
                        <input
                          name="body"
                          required
                          className="min-w-52 flex-1 rounded-xl border border-black/15 px-3 py-2 text-xs"
                          placeholder={`Message ${tech.name}`}
                        />
                        <Button type="submit" size="sm">Send message</Button>
                      </form>
                    ) : null}

                    {profile.role === 'technician' && profile.id === tech.id ? (
                      <form action={sendStaffMessage} className="mt-3 flex flex-wrap gap-2">
                        <input type="hidden" name="mode" value="to_workshop" />
                        <input
                          name="body"
                          required
                          className="min-w-52 flex-1 rounded-xl border border-black/15 px-3 py-2 text-xs"
                          placeholder="Message workshop admin"
                        />
                        <Button type="submit" size="sm">Message workshop</Button>
                      </form>
                    ) : null}
                  </div>

                  {profile.role === 'admin' ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Remove technician</summary>
                      <form action={removeTechnician} className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                        <input type="hidden" name="technicianId" value={tech.id} />
                        <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" name="reason" required rows={3} className="w-full rounded-xl border border-black/15 px-3 py-2 text-xs" placeholder="Reason for removing this technician" />
                        <input name="document" type="file" className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs" />
                        <Button type="submit" variant="destructive" size="sm">Confirm remove</Button>
                      </form>
                    </details>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-600">No technicians yet. Add your first technician above.</p>
        )}
      </SectionCard>
    </main>
  );
}
