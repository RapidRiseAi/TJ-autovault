'use client';

import { useState } from 'react';
import {
  createRecommendation,
  updateInvoicePaymentStatus,
  updateServiceJobStatus,
  updateVehicleServiceReminders,
  updateWorkRequestStatus,
  WORK_REQUEST_STATUSES
} from '@/lib/actions/workshop';

type ActionResponse = { ok: boolean; error?: string; message?: string };

export function VehicleWorkflowActions({
  vehicleId,
  invoices,
  jobs,
  workRequests,
  compact
}: {
  vehicleId: string;
  invoices: Array<{ id: string }>;
  jobs: Array<{ id: string }>;
  workRequests: Array<{ id: string; status: string }>;
  compact?: boolean;
}) {
  const [msg, setMsg] = useState('');

  async function on(run: () => Promise<ActionResponse>) {
    const result = await run();
    setMsg(result.ok ? result.message ?? 'Saved' : result.error ?? 'Failed');
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-3'}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void on(() =>
            createRecommendation({
              vehicleId,
              title: String(formData.get('title') || ''),
              description: String(formData.get('description') || ''),
              severity: String(formData.get('severity') || 'medium') as 'low' | 'medium' | 'high'
            })
          );
        }}
        className="space-y-2 rounded border p-3 text-sm"
      >
        <h3 className="font-semibold">Add recommendation</h3>
        <input required name="title" className="w-full rounded border p-2" />
        <textarea name="description" className="w-full rounded border p-2" />
        <select name="severity" className="w-full rounded border p-2">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button className="rounded bg-black px-3 py-1 text-white">Add</button>
      </form>

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
        className="space-y-2 rounded border p-3 text-sm"
      >
        <h3 className="font-semibold">Mileage/reminders</h3>
        <input name="odometerKm" type="number" className="w-full rounded border p-2" />
        <input name="nextServiceKm" type="number" className="w-full rounded border p-2" />
        <input type="date" name="nextServiceDate" className="w-full rounded border p-2" />
        <button className="rounded bg-black px-3 py-1 text-white">Save</button>
      </form>

      {workRequests.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              updateWorkRequestStatus({
                workRequestId: String(formData.get('workRequestId') || ''),
                status: String(formData.get('status') || 'requested') as (typeof WORK_REQUEST_STATUSES)[number]
              })
            );
          }}
          className="space-y-2 rounded border p-3 text-sm"
        >
          <h3 className="font-semibold">Update work request status</h3>
          <select name="workRequestId" className="w-full rounded border p-2">
            {workRequests.map((request) => (
              <option key={request.id} value={request.id}>{request.id} ({request.status})</option>
            ))}
          </select>
          <select name="status" className="w-full rounded border p-2">
            {WORK_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <button className="rounded bg-black px-3 py-1 text-white">Update</button>
        </form>
      ) : null}

      {invoices.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              updateInvoicePaymentStatus({
                invoiceId: String(formData.get('invoiceId')),
                paymentStatus: String(formData.get('paymentStatus')) as 'unpaid' | 'partial' | 'paid'
              })
            );
          }}
          className="space-y-2 rounded border p-3 text-sm"
        >
          <h3 className="font-semibold">Update payment</h3>
          <select name="invoiceId" className="w-full rounded border p-2">
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>{invoice.id}</option>
            ))}
          </select>
          <select name="paymentStatus" className="w-full rounded border p-2">
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
          <button className="rounded bg-black px-3 py-1 text-white">Update</button>
        </form>
      ) : null}

      {jobs.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void on(() =>
              updateServiceJobStatus({
                jobId: String(formData.get('jobId')),
                status: String(formData.get('status')) as 'open' | 'awaiting_approval' | 'in_progress' | 'completed' | 'cancelled'
              })
            );
          }}
          className="space-y-2 rounded border p-3 text-sm"
        >
          <h3 className="font-semibold">Update service job status</h3>
          <select name="jobId" className="w-full rounded border p-2">
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>{job.id}</option>
            ))}
          </select>
          <select name="status" className="w-full rounded border p-2">
            <option value="open">Open</option>
            <option value="awaiting_approval">Awaiting approval</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="rounded bg-black px-3 py-1 text-white">Update</button>
        </form>
      ) : null}

      {msg ? <p className="text-xs">{msg}</p> : null}
    </div>
  );
}
