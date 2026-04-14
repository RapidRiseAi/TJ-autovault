'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeDollarSign } from 'lucide-react';
import { updateInvoicePaymentStatus } from '@/lib/actions/workshop';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast-provider';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  payment_status: string | null;
  payment_method: string | null;
  total_cents: number | null;
  balance_due_cents: number | null;
  created_at: string | null;
  vehicle_label: string;
};

export function CustomerInvoicesPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'partial' | 'paid'>('paid');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const unpaidTotal = useMemo(
    () => invoices.filter((row) => (row.payment_status ?? 'unpaid') !== 'paid').reduce((sum, row) => sum + Number(row.balance_due_cents ?? row.total_cents ?? 0), 0),
    [invoices]
  );

  async function save() {
    setIsSaving(true);
    const result = await updateInvoicePaymentStatus({
      invoiceIds: selectedIds,
      paymentStatus,
      paymentMethod: paymentMethod || null
    });
    setIsSaving(false);

    if (!result.ok) {
      pushToast({ title: 'Could not update invoices', description: result.error, tone: 'error' });
      return;
    }

    pushToast({ title: 'Payment status updated', description: result.message ?? undefined, tone: 'success' });
    setOpen(false);
    router.refresh();
  }

  return (
    <Card className="rounded-3xl border-black/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-black">Invoices & payment status</h2>
          <p className="text-sm text-gray-600">Total owed (unpaid only): <strong>{formatMoney(unpaidTotal)}</strong></p>
        </div>
        <Button onClick={() => { setOpen(true); setSelectedIds(invoices.filter((row) => (row.payment_status ?? 'unpaid') !== 'paid').map((row) => row.id)); }}>
          <BadgeDollarSign className="mr-2 h-4 w-4" />Update payment status
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {invoices.map((invoice) => {
          const paid = (invoice.payment_status ?? '').toLowerCase() === 'paid';
          return (
            <div key={invoice.id} className={`rounded-xl border p-3 text-sm ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`}</p>
                <p className="font-semibold">{formatMoney(Number(invoice.total_cents ?? 0))}</p>
              </div>
              <p className="text-xs text-gray-600">{invoice.vehicle_label} · Status: {(invoice.payment_status ?? 'unpaid').replace('_', ' ')}</p>
            </div>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Bulk update invoice payment status">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(invoices.map((row) => row.id))}>Select all</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(invoices.filter((row) => (row.payment_status ?? 'unpaid') !== 'paid').map((row) => row.id))}>Select unpaid</Button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {invoices.map((invoice) => (
              <label key={invoice.id} className="flex items-center justify-between rounded-lg border border-black/10 px-2 py-1.5 text-xs">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(invoice.id)}
                    onChange={() => setSelectedIds((current) => current.includes(invoice.id) ? current.filter((id) => id !== invoice.id) : [...current, invoice.id])}
                  />
                  {invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`}
                </span>
                <span>{formatMoney(Number(invoice.total_cents ?? 0))}</span>
              </label>
            ))}
          </div>
          <select className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as 'unpaid' | 'partial' | 'paid')}>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
          <select className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="">Select payment method</option>
            <option value="cash">Cash</option>
            <option value="eft">EFT</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
          <Button disabled={isSaving || !selectedIds.length} onClick={() => void save()} className="w-full">
            {isSaving ? 'Updating…' : `Update ${selectedIds.length} invoice${selectedIds.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
