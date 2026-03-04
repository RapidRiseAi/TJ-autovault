import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCustomerStatementPdf } from '@/lib/workshop/customer-statement-pdf';

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const search = request.nextUrl.searchParams;
  const customerId = search.get('customerId');
  const from = search.get('from');
  const to = search.get('to');
  const type = search.get('type') || 'both';
  const format = search.get('format') || 'pdf';

  if (!customerId || !from || !to) {
    return NextResponse.json({ error: 'customerId, from and to are required' }, { status: 400 });
  }

  const [{ data: workshop }, { data: customer }] = await Promise.all([
    supabase
      .from('workshop_accounts')
      .select('name')
      .eq('id', profile.workshop_account_id)
      .maybeSingle(),
    supabase
      .from('customer_accounts')
      .select('id,name')
      .eq('id', customerId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle()
  ]);

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const quotePromise = type === 'invoice'
    ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
    : supabase
        .from('quotes')
        .select('id,quote_number,status,total_cents,created_at,vehicle_id,vehicles(registration_number)')
        .eq('workshop_account_id', profile.workshop_account_id)
        .eq('customer_account_id', customerId)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: true });

  const invoicePromise = type === 'quote'
    ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
    : supabase
        .from('invoices')
        .select('id,invoice_number,status,payment_status,total_cents,amount_paid_cents,balance_due_cents,created_at,vehicle_id,vehicles(registration_number)')
        .eq('workshop_account_id', profile.workshop_account_id)
        .eq('customer_account_id', customerId)
        .gte('created_at', `${from}T00:00:00.000Z`)
        .lte('created_at', `${to}T23:59:59.999Z`)
        .order('created_at', { ascending: true });

  const [quotes, invoices] = await Promise.all([quotePromise, invoicePromise]);

  const rows = [
    ...((quotes.data ?? []).map((quote) => ({
      date: String(quote.created_at ?? '').slice(0, 10),
      kind: 'quote' as const,
      number: String(quote.quote_number ?? quote.id ?? ''),
      status: String(quote.status ?? 'sent'),
      amountCents: Number(quote.total_cents ?? 0),
      balanceCents: 0,
      vehicle: ((quote.vehicles as { registration_number?: string } | null)?.registration_number ?? '-')
    }))),
    ...((invoices.data ?? []).map((invoice) => ({
      date: String(invoice.created_at ?? '').slice(0, 10),
      kind: 'invoice' as const,
      number: String(invoice.invoice_number ?? invoice.id ?? ''),
      status: String(invoice.payment_status ?? invoice.status ?? 'unpaid'),
      amountCents: Number(invoice.total_cents ?? 0),
      paidCents: Number(invoice.amount_paid_cents ?? 0),
      balanceCents: Number(invoice.balance_due_cents ?? invoice.total_cents ?? 0),
      vehicle: ((invoice.vehicles as { registration_number?: string } | null)?.registration_number ?? '-')
    })))
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (format === 'csv') {
    const header = ['Date', 'Type', 'Number', 'Status', 'Vehicle', 'Amount', 'Paid', 'Balance'];
    const body = rows.map((row) => [
      csvEscape(row.date),
      csvEscape(row.kind),
      csvEscape(row.number),
      csvEscape(row.status),
      csvEscape(row.vehicle),
      csvEscape(String(row.amountCents / 100)),
      csvEscape(String((('paidCents' in row ? row.paidCents : 0) ?? 0) / 100)),
      csvEscape(String((row.balanceCents ?? 0) / 100))
    ].join(','));

    const csv = [header.join(','), ...body].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="statement-${customer.name}-${from}-${to}.csv"`
      }
    });
  }

  const pdfBytes = await buildCustomerStatementPdf({
    workshopName: workshop?.name || 'Workshop',
    customerName: customer.name,
    from,
    to,
    rows
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${customer.name}-${from}-${to}.pdf"`
    }
  });
}
