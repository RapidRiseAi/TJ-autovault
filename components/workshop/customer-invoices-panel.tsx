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
  customer_id?: string | null;
  customer_label?: string | null;
  vehicle_id?: string | null;
  vehicle_label: string;
};

export function CustomerInvoicesPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'partial' | 'paid'>('paid');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');

  const unpaidTotal = useMemo(
    () => invoices.filter((row) => (row.payment_status ?? 'unpaid') !== 'paid').reduce((sum, row) => sum + Number(row.balance_due_cents ?? row.total_cents ?? 0), 0),
    [invoices]
  );
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((row) => {
        const isPaid = (row.payment_status ?? '').toLowerCase() === 'paid';
        const statusMatch =
          statusFilter === 'all' ? true : statusFilter === 'paid' ? isPaid : !isPaid;
        const customerMatch =
          customerFilter === 'all' ? true : (row.customer_id ?? '') === customerFilter;
        const vehicleMatch =
          vehicleFilter === 'all' ? true : (row.vehicle_id ?? '') === vehicleFilter;
        return statusMatch && customerMatch && vehicleMatch;
      }),
    [invoices, statusFilter, customerFilter, vehicleFilter]
  );
  const customerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          invoices
            .filter((row) => row.customer_id && row.customer_label)
            .map((row) => [row.customer_id as string, row.customer_label as string])
        )
      ).map(([id, label]) => ({ id, label })),
    [invoices]
  );
  const vehicleOptions = useMemo(
    () =>
      Array.from(
        new Map(
          invoices
            .filter((row) => row.vehicle_id && row.vehicle_label)
            .map((row) => [row.vehicle_id as string, row.vehicle_label])
        )
      ).map(([id, label]) => ({ id, label })),
    [invoices]
  );

  async function save() {
    setIsSaving(true);
    if (paymentProofFile && !selectedIds.length) {
      pushToast({ title: 'Select invoice(s) first', tone: 'error' });
      setIsSaving(false);
      return;
    }
    if (paymentProofFile) {
      const selectedInvoices = filteredInvoices.filter((invoice) =>
        selectedIds.includes(invoice.id)
      );
      const firstVehicleId = selectedInvoices[0]?.vehicle_id ?? null;
      if (!firstVehicleId) {
        pushToast({
          title: 'Proof upload requires a vehicle',
          description: 'Filter to a specific vehicle and try again.',
          tone: 'error'
        });
        setIsSaving(false);
        return;
      }

      const signResponse = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: firstVehicleId,
          fileName: paymentProofFile.name,
          contentType: paymentProofFile.type || 'application/octet-stream',
          kind: 'file',
          documentType: 'other'
        })
      });
      if (!signResponse.ok) {
        pushToast({ title: 'Could not sign proof upload', tone: 'error' });
        setIsSaving(false);
        return;
      }
      const signedPayload = (await signResponse.json()) as {
        bucket: string;
        path: string;
        token: string;
      };
      const uploadResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type':
              paymentProofFile.type || 'application/octet-stream',
            'x-upsert': 'true'
          },
          body: paymentProofFile
        }
      );
      if (!uploadResponse.ok) {
        pushToast({ title: 'Could not upload proof file', tone: 'error' });
        setIsSaving(false);
        return;
      }
      await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: firstVehicleId,
          bucket: signedPayload.bucket,
          path: signedPayload.path,
          contentType: paymentProofFile.type || 'application/octet-stream',
          size: paymentProofFile.size,
          originalName: paymentProofFile.name,
          docType: 'other',
          subject: `Payment proof uploaded (${selectedIds.length} invoice${selectedIds.length === 1 ? '' : 's'})`,
          urgency: 'info'
        })
      });
    }

    const parsedPaymentAmount = Number(paymentAmount);
    const result = await updateInvoicePaymentStatus({
      invoiceIds: selectedIds,
      paymentStatus,
      paymentMethod: paymentMethod || null,
      paymentAmountCents:
        Number.isFinite(parsedPaymentAmount) && parsedPaymentAmount > 0
          ? Math.round(parsedPaymentAmount * 100)
          : null
    });
    setIsSaving(false);

    if (!result.ok) {
      pushToast({ title: 'Could not update invoices', description: result.error, tone: 'error' });
      return;
    }

    pushToast({ title: 'Payment status updated', description: result.message ?? undefined, tone: 'success' });
    setOpen(false);
    setPaymentAmount('');
    setPaymentProofFile(null);
    router.refresh();
  }

  return (
    <Card className="rounded-3xl border-black/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-black">Invoices & payment status</h2>
          <p className="text-sm text-gray-600">Total owed (unpaid only): <strong>{formatMoney(unpaidTotal)}</strong></p>
        </div>
        <Button onClick={() => { setOpen(true); setSelectedIds(filteredInvoices.filter((row) => (row.payment_status ?? 'unpaid') !== 'paid').map((row) => row.id)); }}>
          <BadgeDollarSign className="mr-2 h-4 w-4" />Update payment status
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select className="rounded-xl border border-black/15 px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'paid' | 'unpaid')}>
          <option value="all">All payment statuses</option>
          <option value="paid">Paid only</option>
          <option value="unpaid">Unpaid/partial only</option>
        </select>
        <select className="rounded-xl border border-black/15 px-3 py-2 text-sm" value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
          <option value="all">All customers</option>
          {customerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.label}</option>
          ))}
        </select>
        <select className="rounded-xl border border-black/15 px-3 py-2 text-sm" value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}>
          <option value="all">All vehicles</option>
          {vehicleOptions.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        {filteredInvoices.map((invoice) => {
          const paid = (invoice.payment_status ?? '').toLowerCase() === 'paid';
          return (
            <div key={invoice.id} className={`rounded-xl border p-3 text-sm ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`}</p>
                <p className="font-semibold">{formatMoney(Number(invoice.total_cents ?? 0))}</p>
              </div>
              <p className="text-xs text-gray-600">{invoice.customer_label ? `${invoice.customer_label} · ` : ''}{invoice.vehicle_label} · Status: {(invoice.payment_status ?? 'unpaid').replace('_', ' ')}</p>
            </div>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Bulk update invoice payment status">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(filteredInvoices.map((row) => row.id))}>Select all filtered</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(filteredInvoices.filter((row) => (row.payment_status ?? 'unpaid') !== 'paid').map((row) => row.id))}>Select unpaid filtered</Button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {filteredInvoices.map((invoice) => (
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
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            placeholder="Payment amount received (e.g. 500.00)"
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
          />
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            onChange={(event) =>
              setPaymentProofFile(event.target.files?.[0] ?? null)
            }
          />
          <Button disabled={isSaving || !selectedIds.length} onClick={() => void save()} className="w-full">
            {isSaving ? 'Updating…' : `Update ${selectedIds.length} invoice${selectedIds.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
