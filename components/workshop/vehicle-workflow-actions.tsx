'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeDollarSign, ClipboardCheck, Gauge, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { ActionTile } from '@/components/workshop/action-tile';
import { ModalFormShell } from '@/components/workshop/modal-form-shell';
import { createRecommendation, updateInvoicePaymentStatus, updateServiceJobStatus, updateVehicleServiceReminders, updateWorkRequestStatus } from '@/lib/actions/workshop';
import { WORK_REQUEST_STATUSES } from '@/lib/work-request-statuses';

type ActionResponse = { ok: boolean; error?: string; message?: string };

type Mode = 'recommendation' | 'mileage' | 'request' | 'payment' | 'job' | null;

export function VehicleWorkflowActions({ vehicleId, invoices, jobs, workRequests, currentMileage }: { vehicleId: string; invoices: Array<{ id: string; invoiceNumber?: string | null; paymentStatus?: string | null; totalCents?: number | null }>; jobs: Array<{ id: string }>; workRequests: Array<{ id: string; status: string }>; currentMileage: number; compact?: boolean; }) {
  const [open, setOpen] = useState<Mode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const { pushToast } = useToast();

  const activeWorkRequests = workRequests.filter((request) => !['cancelled', 'completed'].includes((request.status ?? '').toLowerCase()));
  const unpaidInvoices = invoices.filter((invoice) => (invoice.paymentStatus ?? '').toLowerCase() !== 'paid');

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
      pushToast({ title: 'Action failed', description: message, tone: 'error' });
      setMsg(message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <ActionTile title="Add recommendation" description="Log work and recommended follow-up items." icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setOpen('recommendation')} />
        <ActionTile title="Update mileage" description="Capture latest odometer and service reminders." icon={<Gauge className="h-4 w-4" />} onClick={() => setOpen('mileage')} />
        {activeWorkRequests.length ? <ActionTile title="Update work request status" description="Move requests through the workshop pipeline." icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setOpen('request')} /> : null}
        {unpaidInvoices.length ? <ActionTile title="Update payment status" description="Mark invoice payment progress for this vehicle." icon={<BadgeDollarSign className="h-4 w-4" />} onClick={() => setOpen('payment')} /> : null}
        {jobs.length ? <ActionTile title="Update service job status" description="Update service job stage for active work." icon={<Wrench className="h-4 w-4" />} onClick={() => setOpen('job')} /> : null}
      </div>

      <Modal open={open === 'recommendation'} onClose={() => setOpen(null)} title="Add recommendation">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => createRecommendation({ vehicleId, title: String(formData.get('title') || ''), description: String(formData.get('description') || ''), severity: String(formData.get('severity') || 'medium') as 'low' | 'medium' | 'high' })); }}>
          <ModalFormShell>
            <input required name="title" placeholder="Recommendation title" />
            <textarea name="description" placeholder="Description" />
            <select name="severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
            <Button disabled={isLoading}>{isLoading ? 'Saving...' : 'Add'}</Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal open={open === 'mileage'} onClose={() => setOpen(null)} title="Update mileage">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateVehicleServiceReminders({ vehicleId, odometerKm: Number(formData.get('odometerKm') || 0), nextServiceKm: Number(formData.get('nextServiceKm') || 0), nextServiceDate: String(formData.get('nextServiceDate') || '') })); }}>
          <ModalFormShell>
            <input name="odometerKm" type="number" min={currentMileage} defaultValue={currentMileage} placeholder="Odometer km" />
            <input name="nextServiceKm" type="number" min={currentMileage} defaultValue={currentMileage} placeholder="Next service km" />
            <input type="date" name="nextServiceDate" />
            <Button disabled={isLoading}>{isLoading ? 'Saving...' : 'Save'}</Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal open={open === 'request'} onClose={() => setOpen(null)} title="Update work request status">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateWorkRequestStatus({ workRequestId: String(formData.get('workRequestId') || ''), status: String(formData.get('status') || 'requested') as (typeof WORK_REQUEST_STATUSES)[number] })); }}>
          <ModalFormShell>
            <select name="workRequestId">{activeWorkRequests.map((request) => <option key={request.id} value={request.id}>{request.id} ({request.status})</option>)}</select>
            <select name="status">{WORK_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
            <Button disabled={isLoading}>{isLoading ? 'Updating...' : 'Update'}</Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal open={open === 'payment'} onClose={() => setOpen(null)} title="Update payment status">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateInvoicePaymentStatus({ invoiceId: String(formData.get('invoiceId')), paymentStatus: String(formData.get('paymentStatus')) as 'unpaid' | 'partial' | 'paid' })); }}>
          <ModalFormShell>
            <select name="invoiceId">{unpaidInvoices.map((invoice) => { const ref = invoice.invoiceNumber || `#${invoice.id.slice(0, 8).toUpperCase()}`; const amount = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format((invoice.totalCents ?? 0) / 100); return <option key={invoice.id} value={invoice.id}>{ref} · {amount} unpaid</option>; })}</select>
            <select name="paymentStatus"><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select>
            <Button disabled={isLoading}>{isLoading ? 'Updating...' : 'Update'}</Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>

      <Modal open={open === 'job'} onClose={() => setOpen(null)} title="Update service job status">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateServiceJobStatus({ jobId: String(formData.get('jobId')), status: String(formData.get('status')) as 'open' | 'awaiting_approval' | 'in_progress' | 'completed' | 'cancelled' })); }}>
          <ModalFormShell>
            <select name="jobId">{jobs.map((job) => <option key={job.id} value={job.id}>{job.id}</option>)}</select>
            <select name="status"><option value="open">Open</option><option value="awaiting_approval">Awaiting approval</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
            <Button disabled={isLoading}>{isLoading ? 'Updating...' : 'Update'}</Button>
            {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
          </ModalFormShell>
        </form>
      </Modal>
    </div>
  );
}
