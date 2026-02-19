'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { createRecommendation, updateInvoicePaymentStatus, updateServiceJobStatus, updateVehicleServiceReminders, updateWorkRequestStatus } from '@/lib/actions/workshop';
import { WORK_REQUEST_STATUSES } from '@/lib/work-request-statuses';

type ActionResponse = { ok: boolean; error?: string; message?: string };

type Mode = 'recommendation' | 'mileage' | 'request' | 'payment' | 'job' | null;

export function VehicleWorkflowActions({ vehicleId, invoices, jobs, workRequests, compact }: { vehicleId: string; invoices: Array<{ id: string }>; jobs: Array<{ id: string }>; workRequests: Array<{ id: string; status: string }>; compact?: boolean; }) {
  const [open, setOpen] = useState<Mode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const { pushToast } = useToast();

  async function on(run: () => Promise<ActionResponse>) {
    setIsLoading(true);
    const result = await run();
    setIsLoading(false);
    if (result.ok) {
      pushToast({ title: result.message ?? 'Saved', tone: 'success' });
      setMsg('');
      setOpen(null);
    } else {
      const message = result.error ?? 'Failed';
      pushToast({ title: 'Action failed', description: message, tone: 'error' });
      setMsg(message);
    }
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3'}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen('recommendation')}>Add recommendation</Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen('mileage')}>Update mileage</Button>
        {workRequests.length ? <Button size="sm" variant="secondary" onClick={() => setOpen('request')}>Update work request status</Button> : null}
        {invoices.length ? <Button size="sm" variant="secondary" onClick={() => setOpen('payment')}>Update payment status</Button> : null}
        {jobs.length ? <Button size="sm" variant="secondary" onClick={() => setOpen('job')}>Update work request status</Button> : null}
      </div>

      <Modal open={open === 'recommendation'} onClose={() => setOpen(null)} title="Add recommendation">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => createRecommendation({ vehicleId, title: String(formData.get('title') || ''), description: String(formData.get('description') || ''), severity: String(formData.get('severity') || 'medium') as 'low' | 'medium' | 'high' })); }} className="space-y-2 text-sm">
          <input required name="title" className="w-full rounded border p-2" />
          <textarea name="description" className="w-full rounded border p-2" />
          <select name="severity" className="w-full rounded border p-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
          <Button disabled={isLoading}>{isLoading ? 'Saving...' : 'Add'}</Button>
          {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
        </form>
      </Modal>

      <Modal open={open === 'mileage'} onClose={() => setOpen(null)} title="Update mileage">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateVehicleServiceReminders({ vehicleId, odometerKm: Number(formData.get('odometerKm') || 0), nextServiceKm: Number(formData.get('nextServiceKm') || 0), nextServiceDate: String(formData.get('nextServiceDate') || '') })); }} className="space-y-2 text-sm">
          <input name="odometerKm" type="number" className="w-full rounded border p-2" placeholder="Odometer km" />
          <input name="nextServiceKm" type="number" className="w-full rounded border p-2" placeholder="Next service km" />
          <input type="date" name="nextServiceDate" className="w-full rounded border p-2" />
          <Button disabled={isLoading}>{isLoading ? 'Saving...' : 'Save'}</Button>
          {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
        </form>
      </Modal>

      <Modal open={open === 'request'} onClose={() => setOpen(null)} title="Update work request status">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateWorkRequestStatus({ workRequestId: String(formData.get('workRequestId') || ''), status: String(formData.get('status') || 'requested') as (typeof WORK_REQUEST_STATUSES)[number] })); }} className="space-y-2 text-sm">
          <select name="workRequestId" className="w-full rounded border p-2">{workRequests.map((request) => <option key={request.id} value={request.id}>{request.id} ({request.status})</option>)}</select>
          <select name="status" className="w-full rounded border p-2">{WORK_REQUEST_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
          <Button disabled={isLoading}>{isLoading ? 'Updating...' : 'Update'}</Button>
          {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
        </form>
      </Modal>

      <Modal open={open === 'payment'} onClose={() => setOpen(null)} title="Update payment status">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateInvoicePaymentStatus({ invoiceId: String(formData.get('invoiceId')), paymentStatus: String(formData.get('paymentStatus')) as 'unpaid' | 'partial' | 'paid' })); }} className="space-y-2 text-sm">
          <select name="invoiceId" className="w-full rounded border p-2">{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.id}</option>)}</select>
          <select name="paymentStatus" className="w-full rounded border p-2"><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select>
          <Button disabled={isLoading}>{isLoading ? 'Updating...' : 'Update'}</Button>
          {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
        </form>
      </Modal>

      <Modal open={open === 'job'} onClose={() => setOpen(null)} title="Update service job status">
        <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); void on(() => updateServiceJobStatus({ jobId: String(formData.get('jobId')), status: String(formData.get('status')) as 'open' | 'awaiting_approval' | 'in_progress' | 'completed' | 'cancelled' })); }} className="space-y-2 text-sm">
          <select name="jobId" className="w-full rounded border p-2">{jobs.map((job) => <option key={job.id} value={job.id}>{job.id}</option>)}</select>
          <select name="status" className="w-full rounded border p-2"><option value="open">Open</option><option value="awaiting_approval">Awaiting approval</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
          <Button disabled={isLoading}>{isLoading ? 'Updating...' : 'Update'}</Button>
          {msg ? <p className="text-xs text-red-700">{msg}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
