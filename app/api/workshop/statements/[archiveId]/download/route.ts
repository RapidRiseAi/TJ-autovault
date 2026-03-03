import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildMonthlyStatementPdf } from '@/lib/workshop/statement-pdf';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ archiveId: string }> }
) {
  const { archiveId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: archive } = await supabase
    .from('workshop_monthly_statement_archives')
    .select('id,month_start,month_end,totals,line_items,pdf_storage_path')
    .eq('id', archiveId)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (!archive) {
    return NextResponse.json({ error: 'Statement archive not found' }, { status: 404 });
  }

  const { data: workshop } = await supabase
    .from('workshop_accounts')
    .select('name')
    .eq('id', profile.workshop_account_id)
    .maybeSingle();

  const totals = (archive.totals ?? {}) as { income_cents?: number; expense_cents?: number; profit_cents?: number };
  const income = Number(totals.income_cents ?? 0);
  const expenses = Number(totals.expense_cents ?? 0);
  const profit = Number(totals.profit_cents ?? income - expenses);

  if (income === 0 && expenses === 0 && profit === 0) {
    return NextResponse.json({ error: 'No statement activity for this month' }, { status: 404 });
  }

  let pdfStoragePath = archive.pdf_storage_path as string | null;

  const generateAndStorePdf = async () => {
    const storagePath = `workshop/${profile.workshop_account_id}/statements/${archive.month_start}.pdf`;
    const pdfBytes = await buildMonthlyStatementPdf({
      workshopName: workshop?.name?.trim() || 'Workshop',
      monthStart: String(archive.month_start),
      monthEnd: String(archive.month_end),
      totals: {
        income_cents: income,
        expense_cents: expenses,
        profit_cents: profit
      },
      lineItems: Array.isArray(archive.line_items)
        ? (archive.line_items as Array<{
            occurred_on?: string;
            entry_kind?: 'income' | 'expense' | string;
            description?: string | null;
            category?: string | null;
            amount_cents?: number | string | null;
          }>)
        : []
    });

    const { error: uploadError } = await supabase.storage
      .from('vehicle-files')
      .upload(storagePath, Buffer.from(pdfBytes), { upsert: true, contentType: 'application/pdf' });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const { error: updateError } = await supabase
      .from('workshop_monthly_statement_archives')
      .update({
        pdf_storage_path: storagePath,
        pdf_generated_at: new Date().toISOString()
      })
      .eq('id', archive.id)
      .eq('workshop_account_id', profile.workshop_account_id);

    if (updateError) {
      return { error: updateError.message };
    }

    pdfStoragePath = storagePath;
    return { error: null as string | null };
  };

  if (!pdfStoragePath) {
    const result = await generateAndStorePdf();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  let { data: signed, error } = await supabase.storage
    .from('vehicle-files')
    .createSignedUrl(pdfStoragePath!, 60);

  if (error?.message?.toLowerCase().includes('object not found')) {
    const result = await generateAndStorePdf();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const retry = await supabase.storage
      .from('vehicle-files')
      .createSignedUrl(pdfStoragePath!, 60);
    signed = retry.data;
    error = retry.error;
  }

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not sign statement URL' }, { status: 400 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
