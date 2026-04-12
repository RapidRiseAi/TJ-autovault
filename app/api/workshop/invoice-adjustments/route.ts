import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const lineItemSchema = z.object({
  description: z.string().trim().min(1),
  qty: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  taxRate: z.number().min(0).max(100).default(0)
});

const payloadSchema = z.object({
  invoiceId: z.string().uuid(),
  noteType: z.enum(['credit', 'debit']),
  settlementChoice: z.enum(['apply_to_invoice', 'carry_forward', 'refund']).optional(),
  reason: z.string().trim().min(3).max(300),
  notes: z.string().trim().max(1000).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lineItems: z.array(lineItemSchema).min(1).max(50)
});

function derivePaymentStatus(amountPaidCents: number, balanceDueCents: number) {
  if (balanceDueCents <= 0) return 'paid' as const;
  if (amountPaidCents > 0) return 'partial' as const;
  return 'unpaid' as const;
}

function toRoundedInt(value: number) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const computedItems = payload.lineItems.map((item, index) => {
    const lineSubtotal = toRoundedInt(item.qty * item.unitPriceCents);
    const lineTax = toRoundedInt((lineSubtotal * item.taxRate) / 100);
    return {
      ...item,
      sortOrder: index,
      lineSubtotal,
      lineTax,
      lineTotal: lineSubtotal + lineTax
    };
  });

  const subtotalCents = computedItems.reduce(
    (sum, item) => sum + item.lineSubtotal,
    0
  );
  const taxCents = computedItems.reduce((sum, item) => sum + item.lineTax, 0);
  const totalCents = subtotalCents + taxCents;

  if (totalCents <= 0) {
    return NextResponse.json(
      { error: 'Adjustment amount must be greater than zero.' },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      'id,invoice_number,total_cents,subtotal_cents,tax_cents,amount_paid_cents,balance_due_cents,customer_account_id,vehicle_id,workshop_account_id'
    )
    .eq('id', payload.invoiceId)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { error: invoiceError?.message ?? 'Invoice not found' },
      { status: 404 }
    );
  }

  const currentTotal = Number(invoice.total_cents ?? 0);
  const currentSubtotal = Number(invoice.subtotal_cents ?? currentTotal);
  const currentTax = Number(invoice.tax_cents ?? 0);
  const currentPaid = Number(invoice.amount_paid_cents ?? 0);
  const currentBalance = Number(
    invoice.balance_due_cents ?? Math.max(currentTotal - currentPaid, 0)
  );

  if (payload.noteType === 'credit' && totalCents > currentTotal) {
    return NextResponse.json(
      {
        error:
          'Credit note amount cannot exceed the current invoice total.'
      },
      { status: 400 }
    );
  }

  if (payload.noteType === 'credit' && !payload.settlementChoice) {
    return NextResponse.json(
      { error: 'Choose how to settle this credit note.' },
      { status: 400 }
    );
  }

  const maxInvoiceOffset = Math.min(currentBalance, totalCents);
  const appliedToInvoiceCents =
    payload.noteType === 'credit' ? maxInvoiceOffset : totalCents;

  if (
    payload.noteType === 'credit' &&
    payload.settlementChoice === 'apply_to_invoice' &&
    totalCents > maxInvoiceOffset
  ) {
    return NextResponse.json(
      {
        error:
          'This invoice balance is lower than the credit amount. Choose carry forward or refund for the remainder.'
      },
      { status: 400 }
    );
  }

  const remainingCreditCents =
    payload.noteType === 'credit' ? totalCents - appliedToInvoiceCents : 0;

  const carriedForwardCents =
    payload.noteType === 'credit' && payload.settlementChoice === 'carry_forward'
      ? remainingCreditCents
      : 0;

  const refundCents =
    payload.noteType === 'credit' && payload.settlementChoice === 'refund'
      ? remainingCreditCents
      : 0;

  const nextTotal =
    payload.noteType === 'credit'
      ? currentTotal - totalCents
      : currentTotal + totalCents;
  const nextSubtotal =
    payload.noteType === 'credit'
      ? Math.max(currentSubtotal - subtotalCents, 0)
      : currentSubtotal + subtotalCents;
  const nextTax =
    payload.noteType === 'credit'
      ? Math.max(currentTax - taxCents, 0)
      : currentTax + taxCents;

  if (nextTotal < 0) {
    return NextResponse.json(
      { error: 'This adjustment would make the invoice total negative.' },
      { status: 400 }
    );
  }

  const nextPaid =
    payload.noteType === 'credit' ? Math.min(currentPaid, nextTotal) : currentPaid;
  const nextBalance = Math.max(nextTotal - nextPaid, 0);
  const nextPaymentStatus = derivePaymentStatus(nextPaid, nextBalance);

  const prefix = payload.noteType === 'credit' ? 'CN' : 'DN';
  const referenceNumber = `${prefix}-${Date.now().toString().slice(-8)}`;

  const { data: adjustment, error: adjustmentError } = await supabase
    .from('invoice_adjustments')
    .insert({
      workshop_account_id: profile.workshop_account_id,
      customer_account_id: invoice.customer_account_id,
      vehicle_id: invoice.vehicle_id,
      invoice_id: invoice.id,
      note_type: payload.noteType,
      status: 'issued',
      reference_number: referenceNumber,
      issue_date: payload.issueDate ?? new Date().toISOString().slice(0, 10),
      reason: payload.reason,
      notes: payload.notes || null,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      net_effect_cents: payload.noteType === 'credit' ? -totalCents : totalCents,
      settlement_preference:
        payload.noteType === 'credit' ? payload.settlementChoice : null,
      applied_to_invoice_cents: appliedToInvoiceCents,
      carried_forward_cents: carriedForwardCents,
      refund_cents: refundCents,
      created_by: profile.id
    })
    .select('id')
    .single();

  if (adjustmentError || !adjustment) {
    return NextResponse.json(
      { error: adjustmentError?.message ?? 'Could not create adjustment note' },
      { status: 400 }
    );
  }

  const { error: itemsError } = await supabase
    .from('invoice_adjustment_items')
    .insert(
      computedItems.map((item) => ({
        adjustment_id: adjustment.id,
        sort_order: item.sortOrder,
        description: item.description,
        qty: item.qty,
        unit_price_cents: item.unitPriceCents,
        line_total_cents: item.lineTotal,
        tax_rate: item.taxRate,
        tax_cents: item.lineTax
      }))
    );

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 400 });
  }

  const { error: invoiceUpdateError } = await supabase
    .from('invoices')
    .update({
      subtotal_cents: nextSubtotal,
      tax_cents: nextTax,
      total_cents: nextTotal,
      amount_paid_cents: nextPaid,
      balance_due_cents: nextBalance,
      payment_status: nextPaymentStatus
    })
    .eq('id', invoice.id)
    .eq('workshop_account_id', profile.workshop_account_id);

  if (invoiceUpdateError) {
    return NextResponse.json(
      { error: invoiceUpdateError.message },
      { status: 400 }
    );
  }

  if (carriedForwardCents > 0) {
    const { error: ledgerError } = await supabase
      .from('customer_credit_ledger')
      .insert({
        workshop_account_id: profile.workshop_account_id,
        customer_account_id: invoice.customer_account_id,
        source_type: 'credit_note',
        source_id: adjustment.id,
        description: `Carry-forward from ${referenceNumber}`,
        delta_cents: carriedForwardCents,
        remaining_cents: carriedForwardCents,
        created_by: profile.id
      });

    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 400 });
    }
  }

  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: profile.workshop_account_id,
    customer_account_id: invoice.customer_account_id,
    vehicle_id: invoice.vehicle_id,
    actor_profile_id: profile.id,
    actor_role: profile.role,
    event_type: 'invoice_adjusted',
    title: `${payload.noteType === 'credit' ? 'Credit' : 'Debit'} note ${referenceNumber}`,
    description: payload.reason,
    importance: 'info',
    metadata: {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      adjustment_id: adjustment.id,
      adjustment_type: payload.noteType,
      total_cents: totalCents,
      applied_to_invoice_cents: appliedToInvoiceCents,
      carried_forward_cents: carriedForwardCents,
      refund_cents: refundCents
    }
  });

  return NextResponse.json({
    ok: true,
    adjustmentId: adjustment.id,
    referenceNumber,
    invoice: {
      id: invoice.id,
      totalCents: nextTotal,
      amountPaidCents: nextPaid,
      balanceDueCents: nextBalance,
      paymentStatus: nextPaymentStatus
    }
  });
}
