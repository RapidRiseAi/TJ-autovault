'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeDollarSign, ClipboardCheck, FileDiff, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { ActionTile } from '@/components/workshop/action-tile';
import { ModalFormShell } from '@/components/workshop/modal-form-shell';
import {
  createRecommendation,
  updateInvoicePaymentStatus,
  updateVehicleServiceReminders,
  updateWorkRequestStatus
} from '@/lib/actions/workshop';
import { WORK_REQUEST_STATUSES } from '@/lib/work-request-statuses';

type ActionResponse = { ok: boolean; error?: string; message?: string };

type Mode =
  | 'recommendation'
  | 'mileage'
  | 'request'
  | 'payment'
  | 'adjustment'
  | null;

export function VehicleWorkflowActions({
  vehicleId,
  invoices,
  workRequests,
  currentMileage
}: {
  vehicleId: string;
  invoices: Array<{
    id: string;
    invoiceNumber?: string | null;
    paymentStatus?: string | null;
    totalCents?: number | null;
    balanceDueCents?: number | null;
  }>;
  jobs: Array<{ id: string }>;
  workRequests: Array<{ id: string; status: string }>;
  currentMileage: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<Mode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [adjustmentType, setAdjustmentType] = useState<'credit' | 'debit'>(
    'credit'
  );
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const { pushToast } = useToast();

  const activeWorkRequests = workRequests.filter(
    (request) =>
      !['cancelled', 'completed'].includes((request.status ?? '').toLowerCase())
  );
  const unpaidInvoices = invoices.filter(
    (invoice) => (invoice.paymentStatus ?? '').toLowerCase() !== 'paid'
  );

  function toggleInvoice(invoiceId: string) {
    setSelectedInvoiceIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  async function on(run: () => Promise<ActionResponse>) {
    setIsLoading(true);
    const result = await run();
    setIsLoading(false);
    if (result.ok) {
      pushToast({ title: result.message ?? 'Saved', tone: 'success' });
      setMsg('');
      setOpen(null);
      router.refresh();
    } else {
      const message = result.error ?? 'Failed';
      pushToast({
        title: 'Action failed',
        description: message,
        tone: 'error'
      });
      setMsg(message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
        <ActionTile
          title="Add recommendation"
          description="Log work and recommended follow-up items."
          icon={<ClipboardCheck className="h-4 w-4" />}
          compactMobile
          onClick={() => setOpen('recommendation')}
        />
        <ActionTile
          title="Update mileage"
          description="Capture latest odometer and service reminders."
          icon={<Gauge className="h-4 w-4" />}
          compactMobile
          onClick={() => setOpen('mileage')}
        />
        {activeWorkRequests.length ? (
          <ActionTile
            title="Update work request status"
            description="Move requests through the workshop pipeline."
            icon={<ClipboardCheck className="h-4 w-4" />}
            compactMobile
            onClick={() => setOpen('request')}
          />
        ) : null}
        {unpaidInvoices.length ? (
          <ActionTile
            title="Update payment status"
            description="Mark invoice payment progress for this vehicle."
            icon={<BadgeDollarSign className="h-4 w-4" />}
            compactMobile
            onClick={() => {
              setSelectedInvoiceIds(unpaidInvoices.map((invoice) => invoice.id));
              setOpen('payment');
            }}
          />
        ) : null}
        {invoices.length ? (
          <ActionTile
            title="Create adjustment note"
            description="Issue credit/debit notes against an invoice."
            icon={<FileDiff className="h-4 w-4" />}
            compactMobile
            onClick={() => setOpen('adjustment')}
          />
        ) : null}
      </div>

      <Modal
        open={open === 'recommendation'}
        onClose={() => setOpen(null)}
        title="Add recommendation"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              createRecommendation({
                vehicleId,
                title: String(formData.get('title') || ''),
                description: String(formData.get('description') || ''),
                severity: String(formData.get('severity') || 'medium') as
                  | 'low'
                  | 'medium'
                  | 'high'
              })
            );
          }}
        >
          <ModalFormShell>
            <input required name="title" placeholder="Recommendation title" />
            <textarea
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              name="description"
              placeholder="Description"
            />
            <select name="severity">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <Button disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Add'}
            </Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal
        open={open === 'mileage'}
        onClose={() => setOpen(null)}
        title="Update mileage"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              updateVehicleServiceReminders({
                vehicleId,
                odometerKm: Number(formData.get('odometerKm') || 0),
                nextServiceKm: Number(formData.get('nextServiceKm') || 0),
                nextServiceDate: String(formData.get('nextServiceDate') || '')
              })
            );
          }}
        >
          <ModalFormShell>
            <input
              name="odometerKm"
              type="number"
              min={currentMileage}
              defaultValue={currentMileage}
              placeholder="Odometer km"
            />
            <input
              name="nextServiceKm"
              type="number"
              min={currentMileage}
              defaultValue={currentMileage}
              placeholder="Next service km"
            />
            <input type="date" name="nextServiceDate" />
            <Button disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal
        open={open === 'request'}
        onClose={() => setOpen(null)}
        title="Update work request status"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              updateWorkRequestStatus({
                workRequestId: String(formData.get('workRequestId') || ''),
                status: String(
                  formData.get('status') || 'requested'
                ) as (typeof WORK_REQUEST_STATUSES)[number]
              })
            );
          }}
        >
          <ModalFormShell>
            <select name="workRequestId">
              {activeWorkRequests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.id} ({request.status})
                </option>
              ))}
            </select>
            <select name="status">
              {WORK_REQUEST_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <Button disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update'}
            </Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal
        open={open === 'payment'}
        onClose={() => setOpen(null)}
        title="Update payment status"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              updateInvoicePaymentStatus({
                invoiceIds: selectedInvoiceIds,
                paymentStatus: String(formData.get('paymentStatus')) as
                  | 'unpaid'
                  | 'partial'
                  | 'paid',
                paymentMethod: String(formData.get('paymentMethod') || '')
              })
            );
          }}
        >
          <ModalFormShell>
            <div className="rounded-xl border border-black/10 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-gray-500">Select invoices</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedInvoiceIds(unpaidInvoices.map((invoice) => invoice.id))}>
                    Select all unpaid
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedInvoiceIds(invoices.map((invoice) => invoice.id))}>
                    Select all
                  </Button>
                </div>
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {invoices.map((invoice) => {
                  const ref = invoice.invoiceNumber || `#${invoice.id.slice(0, 8).toUpperCase()}`;
                  const amount = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format((invoice.totalCents ?? 0) / 100);
                  const isPaid = (invoice.paymentStatus ?? '').toLowerCase() === 'paid';
                  return (
                    <label key={invoice.id} className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs ${isPaid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => toggleInvoice(invoice.id)} />
                        <span>{ref}</span>
                      </span>
                      <span className="font-semibold">{amount}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <select name="paymentStatus">
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            <select name="paymentMethod" defaultValue="">
              <option value="">Select payment method</option>
              <option value="cash">Cash</option>
              <option value="eft">EFT</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
            <Button disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update'}
            </Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal
        open={open === 'adjustment'}
        onClose={() => setOpen(null)}
        title="Create invoice adjustment note"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const amount = Number(formData.get('amount') || 0);
            const amountCents = Math.round(amount * 100);
            if (!Number.isFinite(amount) || amount <= 0 || amountCents <= 0) {
              setMsg('Amount must be greater than 0.');
              return;
            }

            const settlementChoice = String(
              formData.get('settlementChoice') || ''
            );
            const applyScope = String(formData.get('applyScope') || 'customer');
            void on(async () => {
              const response = await fetch(
                '/api/workshop/invoice-adjustments',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    invoiceId: String(formData.get('invoiceId') || ''),
                    noteType: String(formData.get('noteType') || 'credit'),
                    settlementChoice: settlementChoice || undefined,
                    applyScope:
                      applyScope === 'vehicle' ? 'vehicle' : 'customer',
                    reason: String(formData.get('reason') || ''),
                    notes: String(formData.get('notes') || ''),
                    lineItems: [
                      {
                        description: String(
                          formData.get('description') || 'Adjustment'
                        ),
                        qty: 1,
                        unitPriceCents: amountCents,
                        taxRate: Number(formData.get('taxRate') || 0)
                      }
                    ]
                  })
                }
              );

              const body = await response.json();
              if (!response.ok) {
                return {
                  ok: false,
                  error: String(
                    body.error ?? 'Could not create adjustment note'
                  )
                };
              }
              return {
                ok: true,
                message: `Adjustment ${String(body.referenceNumber ?? '')} created.`
              };
            });
          }}
        >
          <ModalFormShell>
            <select name="invoiceId" required>
              <option value="">Select invoice</option>
              {invoices.map((invoice) => {
                const ref =
                  invoice.invoiceNumber ||
                  `#${invoice.id.slice(0, 8).toUpperCase()}`;
                const amount = new Intl.NumberFormat('en-ZA', {
                  style: 'currency',
                  currency: 'ZAR'
                }).format((invoice.totalCents ?? 0) / 100);
                const balance = new Intl.NumberFormat('en-ZA', {
                  style: 'currency',
                  currency: 'ZAR'
                }).format(
                  (invoice.balanceDueCents ?? invoice.totalCents ?? 0) / 100
                );
                return (
                  <option key={invoice.id} value={invoice.id}>
                    {ref} · total {amount} · balance {balance}
                  </option>
                );
              })}
            </select>
            <select
              name="noteType"
              value={adjustmentType}
              onChange={(event) =>
                setAdjustmentType(event.target.value as 'credit' | 'debit')
              }
            >
              <option value="credit">Credit note (reduce)</option>
              <option value="debit">Debit note (increase)</option>
            </select>
            {adjustmentType === 'credit' ? (
              <select name="settlementChoice" required>
                <option value="">Choose credit settlement</option>
                <option value="apply_to_invoice">Apply to this invoice</option>
                <option value="carry_forward">
                  Carry forward to next invoice
                </option>
                <option value="refund">Refund customer</option>
              </select>
            ) : null}
            {adjustmentType === 'credit' ? (
              <select name="applyScope" defaultValue="customer">
                <option value="customer">
                  Apply carry-forward on customer account (default)
                </option>
                <option value="vehicle">
                  Apply carry-forward to the same vehicle only
                </option>
              </select>
            ) : null}
            <input
              required
              name="description"
              placeholder="Line description (e.g. Pricing correction)"
            />
            <input
              required
              name="reason"
              placeholder="Reason for this adjustment note"
            />
            <input
              name="amount"
              type="number"
              min={0.01}
              step={0.01}
              placeholder="Amount (e.g. 150.00)"
            />
            <input
              name="taxRate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="Tax rate % (optional)"
            />
            <textarea name="notes" placeholder="Optional notes" />
            <Button disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create adjustment note'}
            </Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>
    </div>
  );
}
