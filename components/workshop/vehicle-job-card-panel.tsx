'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { ActionTile } from '@/components/workshop/action-tile';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';
import { addJobCardEvent, closeJobCard, startJobCard, updateJobCardStatus } from '@/lib/actions/job-cards';
import { formatJobCardStatus, JOB_CARD_STATUSES } from '@/lib/job-cards';

export function VehicleJobCardPanel({
  vehicleId,
  activeJob,
  technicians,
  canClose
}: {
  vehicleId: string;
  activeJob: null | {
    id: string;
    title: string;
    status: string;
    started_at: string | null;
    last_updated_at: string;
    assignments: Array<{ id: string; name: string; avatarUrl: string | null }>;
  };
  technicians: Array<{ id: string; name: string }>;
  canClose: boolean;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { pushToast } = useToast();

  async function run<T>(fn: () => Promise<T & { ok: boolean; error?: string }>, onDone?: () => void) {
    setIsSaving(true);
    const result = await fn();
    setIsSaving(false);
    if (result.ok) {
      pushToast({ title: 'Saved', tone: 'success' });
      onDone?.();
      window.location.reload();
      return;
    }
    pushToast({ title: 'Could not save', description: result.error, tone: 'error' });
  }

  if (!activeJob) {
    return (
      <>
        <ActionTile
          title="Start job"
          description="Create a new job card with required before photos and technician assignment."
          icon={<PlayCircle className="h-4 w-4" />}
          primary
          onClick={() => setStartOpen(true)}
        />
        <Modal open={startOpen} onClose={() => setStartOpen(false)} title="Start job card">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const title = String(formData.get('title') || 'Service job');
              const beforePhotoPath = String(formData.get('beforePhotoPath') || '');
              const technicianIds = formData.getAll('technicianIds').map(String);
              void run(() => startJobCard({ vehicleId, title, beforePhotoPath, technicianIds }), () => setStartOpen(false));
            }}
          >
            <input name="title" required className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" placeholder="Job title" />
            <input name="beforePhotoPath" required className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" placeholder="Before photo storage path" />
            <select name="technicianIds" multiple className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" defaultValue={[]}>
              {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
            </select>
            <Button disabled={isSaving}>{isSaving ? 'Starting…' : 'Start job'}</Button>
          </form>
        </Modal>
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_14px_28px_rgba(17,17,17,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Active job</p>
          <h3 className="text-lg font-semibold text-black">{activeJob.title}</h3>
          <p className="text-xs text-gray-500">Started {activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : 'just now'} • Updated {new Date(activeJob.last_updated_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{formatJobCardStatus(activeJob.status)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {activeJob.assignments.map((assignment) => (
          <span key={assignment.id} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs">{assignment.name}</span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm"><Link href={`/workshop/jobs/${activeJob.id}`}>Open job</Link></Button>
        <form onSubmit={(event) => { event.preventDefault(); const status = String(new FormData(event.currentTarget).get('status') || 'in_progress'); void run(() => updateJobCardStatus({ jobId: activeJob.id, status: status as never })); }} className="flex gap-2">
          <select name="status" className="rounded-lg border border-neutral-300 px-2 text-xs">
            {JOB_CARD_STATUSES.filter((status) => status !== 'not_started').map((status) => <option key={status} value={status}>{formatJobCardStatus(status)}</option>)}
          </select>
          <Button size="sm" variant="secondary" type="submit">Change status</Button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); const message = String(new FormData(event.currentTarget).get('message') || ''); void run(() => addJobCardEvent({ jobId: activeJob.id, eventType: 'customer_update', note: message, customerFacing: true })); event.currentTarget.reset(); }} className="flex gap-2">
          <input name="message" placeholder="Customer update" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
          <Button size="sm" variant="secondary" type="submit">Post customer update</Button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); const note = String(new FormData(event.currentTarget).get('note') || ''); void run(() => addJobCardEvent({ jobId: activeJob.id, eventType: 'approval_requested', note, customerFacing: true })); event.currentTarget.reset(); }} className="flex gap-2">
          <input name="note" placeholder="Approval request" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
          <Button size="sm" variant="secondary" type="submit">Request approval</Button>
        </form>
        {canClose ? <Button size="sm" variant="outline" onClick={() => void run(() => closeJobCard({ jobId: activeJob.id }))}>Close job</Button> : null}
      </div>
      <Link href={`/workshop/jobs/${activeJob.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-black">View full internal timeline <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
}
