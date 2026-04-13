import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCustomerStatementPdf } from '@/lib/workshop/customer-statement-pdf';

type StatementRowKind =
  | 'quote'
  | 'invoice'
  | 'credit_note'
  | 'debit_note'
  | 'invoice_credit_applied_note';

type StatementRow = {
  date: string;
  timestamp: string;
  kind: StatementRowKind;
  typeCode: 'QUO' | 'INV' | 'CN' | 'DN' | 'APP';
  reference: string;
  linkedInvoiceRef?: string;
  description: string;
  vehicle: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
  status?: string;
  paymentMethod?: string;
};

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function isMissingColumnError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  return /column .* does not exist|schema cache|could not find the '/i.test(
    message
  );
}

function parseCreditNoteReference(text: string | null | undefined) {
  if (!text) return null;
  const match = text.match(/\b(CN-[A-Z0-9-]{4,})\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    return NextResponse.json(
      { error: 'customerId, from and to are required' },
      { status: 400 }
    );
  }

  const [{ data: workshop }, { data: customer }] = await Promise.all([
    supabase
      .from('workshop_accounts')
      .select(
        'name,bank_name,bank_account_name,bank_account_number,bank_branch_code'
      )
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

  const quotePromise =
    type === 'invoice'
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
      : supabase
          .from('quotes')
          .select(
            'id,quote_number,order_number,status,total_cents,created_at,vehicle_id,vehicles(registration_number)'
          )
          .eq('workshop_account_id', profile.workshop_account_id)
          .eq('customer_account_id', customerId)
          .gte('created_at', `${from}T00:00:00.000Z`)
          .lte('created_at', `${to}T23:59:59.999Z`)
          .order('created_at', { ascending: true });

  const invoicePromise =
    type === 'quote'
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
      : supabase
          .from('invoices')
          .select(
            'id,invoice_number,order_number,status,payment_status,payment_method,total_cents,amount_paid_cents,balance_due_cents,created_at,vehicle_id,vehicles(registration_number)'
          )
          .eq('workshop_account_id', profile.workshop_account_id)
          .eq('customer_account_id', customerId)
          .gte('created_at', `${from}T00:00:00.000Z`)
          .lte('created_at', `${to}T23:59:59.999Z`)
          .order('created_at', { ascending: true });

  const adjustmentPromise =
    type === 'quote'
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
      : supabase
          .from('invoice_adjustments')
          .select(
            'id,invoice_id,note_type,reference_number,issue_date,created_at,reason,notes,total_cents,settlement_preference,applied_to_invoice_cents,carried_forward_cents,refund_cents'
          )
          .eq('workshop_account_id', profile.workshop_account_id)
          .eq('customer_account_id', customerId)
          .gte('created_at', `${from}T00:00:00.000Z`)
          .lte('created_at', `${to}T23:59:59.999Z`)
          .order('created_at', { ascending: true });

  const [quotes, invoices, adjustments] = await Promise.all([
    quotePromise,
    invoicePromise,
    adjustmentPromise
  ]);

  const invoiceRows = (invoices.data ?? []) as Array<Record<string, unknown>>;
  const adjustmentRows = (adjustments.data ?? []) as Array<
    Record<string, unknown>
  >;
  const invoiceIds = invoiceRows
    .map((row) => String(row.id ?? ''))
    .filter(Boolean);

  const invoiceReferenceById = new Map(
    invoiceRows.map((row) => [
      String(row.id ?? ''),
      String(row.invoice_number ?? row.id ?? '')
    ])
  );

  const adjustmentSumsByInvoice = new Map<
    string,
    { creditCents: number; debitCents: number }
  >();
  for (const adjustment of adjustmentRows) {
    const invoiceId = String(adjustment.invoice_id ?? '');
    if (!invoiceId) continue;
    const bucket = adjustmentSumsByInvoice.get(invoiceId) ?? {
      creditCents: 0,
      debitCents: 0
    };
    const totalCents = Number(adjustment.total_cents ?? 0);
    if (String(adjustment.note_type ?? '') === 'credit') {
      bucket.creditCents += totalCents;
    } else {
      bucket.debitCents += totalCents;
    }
    adjustmentSumsByInvoice.set(invoiceId, bucket);
  }

  let applications = [] as Array<Record<string, unknown>>;
  if (invoiceIds.length > 0 && type !== 'quote') {
    const enhancedApplications = await supabase
      .from('invoice_credit_applications')
      .select('invoice_id,ledger_entry_id,amount_cents')
      .in('invoice_id', invoiceIds);
    const fallbackApplications =
      enhancedApplications.error &&
      isMissingColumnError(enhancedApplications.error)
        ? await supabase
            .from('invoice_credit_applications')
            .select('invoice_id,amount_cents')
            .in('invoice_id', invoiceIds)
        : enhancedApplications;
    applications = (fallbackApplications.data ?? []) as Array<
      Record<string, unknown>
    >;
  }

  const totalAppliedByInvoice = new Map<string, number>();
  const ledgerIds = applications
    .map((row) => String(row.ledger_entry_id ?? ''))
    .filter(Boolean);

  const creditRefsByLedger = new Map<string, string>();
  if (ledgerIds.length > 0) {
    const enhancedLedger = await supabase
      .from('customer_credit_ledger')
      .select('id,note_reference,description')
      .in('id', ledgerIds);
    const fallbackLedger =
      enhancedLedger.error && isMissingColumnError(enhancedLedger.error)
        ? await supabase
            .from('customer_credit_ledger')
            .select('id,description')
            .in('id', ledgerIds)
        : enhancedLedger;

    for (const row of (fallbackLedger.data ?? []) as Array<
      Record<string, unknown>
    >) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const reference =
        typeof row.note_reference === 'string' && row.note_reference.trim()
          ? row.note_reference.trim().toUpperCase()
          : parseCreditNoteReference(
              typeof row.description === 'string' ? row.description : null
            );
      if (reference) creditRefsByLedger.set(id, reference);
    }
  }

  const appliedCreditRefsByInvoice = new Map<string, Set<string>>();
  for (const app of applications) {
    const invoiceId = String(app.invoice_id ?? '');
    if (!invoiceId) continue;
    const nextTotal =
      (totalAppliedByInvoice.get(invoiceId) ?? 0) +
      Number(app.amount_cents ?? 0);
    totalAppliedByInvoice.set(invoiceId, nextTotal);

    const ledgerId = String(app.ledger_entry_id ?? '');
    const ref = creditRefsByLedger.get(ledgerId);
    if (ref) {
      const refs =
        appliedCreditRefsByInvoice.get(invoiceId) ?? new Set<string>();
      refs.add(ref);
      appliedCreditRefsByInvoice.set(invoiceId, refs);
    }
  }

  if (invoiceIds.length > 0) {
    const invoiceItems = await supabase
      .from('invoice_items')
      .select('invoice_id,description')
      .in('invoice_id', invoiceIds);

    for (const item of (invoiceItems.data ?? []) as Array<
      Record<string, unknown>
    >) {
      const invoiceId = String(item.invoice_id ?? '');
      const parsedRef = parseCreditNoteReference(
        typeof item.description === 'string' ? item.description : null
      );
      if (!invoiceId || !parsedRef) continue;
      const refs =
        appliedCreditRefsByInvoice.get(invoiceId) ?? new Set<string>();
      refs.add(parsedRef);
      appliedCreditRefsByInvoice.set(invoiceId, refs);
    }
  }

  const quoteStatementRows: StatementRow[] = (
    (quotes.data ?? []) as Array<Record<string, unknown>>
  ).map((quote) => ({
    date: String(quote.created_at ?? '').slice(0, 10),
    timestamp: String(quote.created_at ?? ''),
    kind: 'quote',
    typeCode: 'QUO',
    reference: String(quote.quote_number ?? quote.id ?? ''),
    description: `Quote ${(String(quote.order_number ?? '') || '-').trim()}`,
    vehicle:
      (quote.vehicles as { registration_number?: string } | null)
        ?.registration_number ?? '-',
    debitCents: 0,
    creditCents: 0,
    runningBalanceCents: 0,
    status: String(quote.status ?? 'sent')
  }));

  const invoiceStatementRows: StatementRow[] = invoiceRows.map((invoice) => {
    const invoiceId = String(invoice.id ?? '');
    const adjustmentSummary = adjustmentSumsByInvoice.get(invoiceId) ?? {
      creditCents: 0,
      debitCents: 0
    };
    const appliedCredits = totalAppliedByInvoice.get(invoiceId) ?? 0;
    const invoiceContextAmount =
      Number(invoice.total_cents ?? 0) +
      adjustmentSummary.creditCents -
      adjustmentSummary.debitCents +
      appliedCredits;

    const appliedRefs = Array.from(
      appliedCreditRefsByInvoice.get(invoiceId) ?? []
    );
    const appliedAnnotation =
      appliedRefs.length > 0
        ? ` | Credit applied: ${appliedRefs.join(', ')}`
        : appliedCredits > 0
          ? ' | Credit applied'
          : '';

    return {
      date: String(invoice.created_at ?? '').slice(0, 10),
      timestamp: String(invoice.created_at ?? ''),
      kind: 'invoice',
      typeCode: 'INV',
      reference: String(invoice.invoice_number ?? invoice.id ?? ''),
      description: `Invoice amount context${appliedAnnotation}`,
      vehicle:
        (invoice.vehicles as { registration_number?: string } | null)
          ?.registration_number ?? '-',
      debitCents: Math.max(invoiceContextAmount, 0),
      creditCents: 0,
      runningBalanceCents: 0,
      status: String(invoice.payment_status ?? invoice.status ?? 'unpaid'),
      paymentMethod: String(invoice.payment_method ?? '')
    };
  });

  const adjustmentStatementRows: StatementRow[] = adjustmentRows.map(
    (adjustment) => {
      const noteType = String(adjustment.note_type ?? '');
      const isCredit = noteType === 'credit';
      const totalCents = Number(adjustment.total_cents ?? 0);
      const linkedInvoiceId = String(adjustment.invoice_id ?? '');
      const linkedInvoiceRef =
        invoiceReferenceById.get(linkedInvoiceId) ||
        linkedInvoiceId ||
        undefined;

      const settlement = String(adjustment.settlement_preference ?? '').trim();
      const reason = String(adjustment.reason ?? adjustment.notes ?? '').trim();
      const carryForward = Number(adjustment.carried_forward_cents ?? 0);
      const appliedNow = Number(adjustment.applied_to_invoice_cents ?? 0);
      const refund = Number(adjustment.refund_cents ?? 0);
      const settlementSummary =
        settlement || carryForward > 0 || appliedNow > 0 || refund > 0
          ? ` (${[
              settlement ? `settlement: ${settlement}` : '',
              appliedNow > 0 ? `applied: ${(appliedNow / 100).toFixed(2)}` : '',
              carryForward > 0
                ? `carry-forward: ${(carryForward / 100).toFixed(2)}`
                : '',
              refund > 0 ? `refund: ${(refund / 100).toFixed(2)}` : ''
            ]
              .filter(Boolean)
              .join(' | ')})`
          : '';

      return {
        date: String(
          adjustment.issue_date ?? adjustment.created_at ?? ''
        ).slice(0, 10),
        timestamp: String(adjustment.created_at ?? adjustment.issue_date ?? ''),
        kind: isCredit ? 'credit_note' : 'debit_note',
        typeCode: isCredit ? 'CN' : 'DN',
        reference: String(adjustment.reference_number ?? adjustment.id ?? ''),
        linkedInvoiceRef,
        description: `${reason || (isCredit ? 'Credit note' : 'Debit note')}${settlementSummary}`,
        vehicle: '-',
        debitCents: isCredit ? 0 : Math.max(totalCents, 0),
        creditCents: isCredit ? Math.max(totalCents, 0) : 0,
        runningBalanceCents: 0
      };
    }
  );

  const allRows = [
    ...quoteStatementRows,
    ...invoiceStatementRows,
    ...adjustmentStatementRows
  ].sort((a, b) => {
    if (a.timestamp === b.timestamp)
      return a.reference.localeCompare(b.reference);
    return a.timestamp.localeCompare(b.timestamp);
  });

  // Anti-double-counting strategy:
  // - invoice rows carry the original invoice amount context as debit
  //   (current stored total + linked credit/debit note effects + applied carry-forward credits).
  // - credit/debit notes are always emitted as separate signed ledger rows.
  // - credit-application context is annotation-only on the later invoice row (no extra signed row),
  //   so carry-forward is visible without being counted twice.
  let runningBalanceCents = 0;
  const rows = allRows.map((row) => {
    runningBalanceCents += row.debitCents - row.creditCents;
    return { ...row, runningBalanceCents };
  });

  if (format === 'csv') {
    const header = [
      'Date',
      'Type',
      'Reference',
      'Linked Invoice',
      'Description/Reason',
      'Status',
      'Payment Method',
      'Vehicle',
      'Debit',
      'Credit',
      'Balance'
    ];
    const body = rows.map((row) =>
      [
        csvEscape(row.date),
        csvEscape(row.typeCode),
        csvEscape(row.reference),
        csvEscape(row.linkedInvoiceRef ?? ''),
        csvEscape(row.description),
        csvEscape(row.status ?? ''),
        csvEscape(row.paymentMethod ?? ''),
        csvEscape(row.vehicle),
        csvEscape(String(row.debitCents / 100)),
        csvEscape(String(row.creditCents / 100)),
        csvEscape(String(row.runningBalanceCents / 100))
      ].join(',')
    );

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
    workshopBank: {
      bankName: workshop?.bank_name,
      accountName: workshop?.bank_account_name,
      accountNumber: workshop?.bank_account_number,
      branchCode: workshop?.bank_branch_code
    },
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
