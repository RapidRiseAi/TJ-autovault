import { NextResponse } from 'next/server';
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

function redirectWithStatus(request: Request, query: string) {
  const url = new URL('/workshop/technicians', request.url);
  url.search = query;
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return redirectWithStatus(request, '?error=payout_failed');

    const { data: actor } = await supabase
      .from('profiles')
      .select('id,role,workshop_account_id')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (!actor?.workshop_account_id || actor.role !== 'admin') {
      return redirectWithStatus(request, '?error=payout_failed');
    }

    const formData = await request.formData();
    const technicianId = (formData.get('technicianId')?.toString() ?? '').trim();
    const amount = Number(formData.get('amount')?.toString() ?? '0');
    const notes = (formData.get('notes')?.toString() ?? '').trim();
    const proof = formData.get('proof');

    if (
      !technicianId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !(proof instanceof File) ||
      proof.size <= 0
    ) {
      return redirectWithStatus(request, '?error=payout_invalid');
    }

    const adminSupabase = createAdminClient();
    const safeName = sanitizeFileName(proof.name || 'payment-proof');
    const proofPath = `technician-payouts/${actor.workshop_account_id}/${technicianId}/${Date.now()}-${safeName}`;
    const upload = await adminSupabase.storage.from('private-images').upload(proofPath, proof, {
      cacheControl: '3600',
      contentType: proof.type || undefined,
      upsert: false
    });

    if (upload.error) return redirectWithStatus(request, '?error=payout_upload_failed');

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

    if (payoutError) return redirectWithStatus(request, '?error=payout_failed');

    await supabase.from('notifications').insert({
      workshop_account_id: actor.workshop_account_id,
      to_profile_id: technicianId,
      kind: 'system',
      title: 'Technician payment submitted',
      body: `A payment was submitted and is waiting for your confirmation.`,
      href: '/workshop/technicians'
    });

    const financeRef = `technician_payout:${technicianId}:${proofPath}`;
    const { error: financeError } = await supabase.from('workshop_finance_entries').upsert(
      {
        workshop_account_id: actor.workshop_account_id,
        entry_kind: 'expense',
        source_type: 'technician_payout',
        category: 'technician_pay',
        description: notes || 'Technician payout',
        amount_cents: amountCents,
        occurred_on: new Date().toISOString().slice(0, 10),
        external_ref_type: 'technician_payout',
        external_ref_id: financeRef,
        metadata: { technician_profile_id: technicianId, proof_path: proofPath },
        created_by: actor.id
      },
      { onConflict: 'workshop_account_id,source_type,external_ref_type,external_ref_id' }
    );

    if (financeError) {
      const combined = `${financeError.message} ${financeError.details ?? ''} ${financeError.hint ?? ''}`.toLowerCase();
      if (!combined.includes('workshop_finance_entries') && !combined.includes('does not exist')) {
        return redirectWithStatus(request, '?error=payout_failed');
      }
    }

    return redirectWithStatus(request, '?payout=1');
  } catch {
    return redirectWithStatus(request, '?error=payout_failed');
  }
}
