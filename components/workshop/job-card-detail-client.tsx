'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { addJobCardEvent, closeJobCard, completeJobCard, updateJobCardStatus } from '@/lib/actions/job-cards';
import { formatJobCardStatus, JOB_CARD_STATUSES } from '@/lib/job-cards';

type Tab = 'overview' | 'photos' | 'updates' | 'internal' | 'parts' | 'approvals' | 'checklist';

export function JobCardDetailClient(props: {
  jobId: string;
  vehicleId: string;
  isLocked: boolean;
  isManager: boolean;
  status: string;
  statusProgress: number;
  events: Array<{ id: string; event_type: string; payload: { note?: string }; created_at: string }>;
  updates: Array<{ id: string; message: string; created_at: string }>;
  photos: Array<{ id: string; kind: string; storage_path: string; uploaded_at: string }>;
  parts: Array<{ id: string; name: string; qty: number; status: string; eta: string | null; notes: string | null }>;
  blockers: Array<{ id: string; type: string; message: string; created_at: string; resolved_at: string | null }>;
  approvals: Array<{ id: string; title: string; description: string | null; estimate_amount: number | null; status: string; requested_at: string }>;
  checklist: Array<{ id: string; label: string; is_required: boolean; is_done: boolean; done_at: string | null }>;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [isUploading, setIsUploading] = useState(false);
  const tabs: Tab[] = ['overview', 'photos', 'updates', 'internal', 'parts', 'approvals', 'checklist'];

  async function doAction(run: () => Promise<{ ok: boolean }>) {
    const result = await run();
    if (result.ok) window.location.reload();
  }

  async function uploadPhotoFiles(files: File[], kind: 'before' | 'after') {
    const selectedFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!selectedFiles.length) return [] as string[];

    setIsUploading(true);
    try {
      const paths: string[] = [];
      for (const file of selectedFiles) {
        const signResponse = await fetch('/api/uploads/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId: props.vehicleId,
            fileName: file.name,
            contentType: file.type,
            kind: 'image',
            documentType: kind === 'before' ? 'before_photos' : 'after_photos'
          })
        });
        if (!signResponse.ok) throw new Error('Could not sign upload');

        const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string };
        const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
        if (!uploadResponse.ok) throw new Error('Could not upload photo');
        paths.push(signedPayload.path);
      }
      return paths;
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <form onSubmit={(e) => { e.preventDefault(); const status = String(new FormData(e.currentTarget).get('status') || 'in_progress'); void doAction(() => updateJobCardStatus({ jobId: props.jobId, status: status as never })); }} className="flex gap-2">
            <select name="status" disabled={props.isLocked} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
              {JOB_CARD_STATUSES.filter((status) => status !== 'not_started').map((status) => <option value={status} key={status}>{formatJobCardStatus(status)}</option>)}
            </select>
            <Button size="sm" variant="secondary" disabled={props.isLocked}>Change status</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); const note = String(new FormData(e.currentTarget).get('note') || ''); void doAction(() => addJobCardEvent({ jobId: props.jobId, eventType: 'internal_note', note })); }} className="flex gap-2">
            <input name="note" placeholder="Internal note" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
            <Button size="sm" variant="secondary" disabled={props.isLocked}>Add internal note</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); const message = String(new FormData(e.currentTarget).get('message') || ''); void doAction(() => addJobCardEvent({ jobId: props.jobId, eventType: 'customer_update', note: message, customerFacing: true })); }} className="flex gap-2">
            <input name="message" placeholder="Customer update" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
            <Button size="sm" variant="secondary" disabled={props.isLocked}>Post customer update</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); const note = String(new FormData(e.currentTarget).get('note') || 'Approval required'); void doAction(() => addJobCardEvent({ jobId: props.jobId, eventType: 'approval_requested', note, customerFacing: true })); }} className="flex gap-2">
            <input name="note" placeholder="Approval note" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
            <Button size="sm" variant="secondary" disabled={props.isLocked}>Request approval</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const files = form.getAll('photos').filter((value): value is File => value instanceof File); void doAction(async () => { const paths = await uploadPhotoFiles(files, 'before'); if (!paths.length) return { ok: false }; await addJobCardEvent({ jobId: props.jobId, eventType: 'photo_uploaded', note: `${paths.length} photo(s) uploaded` }); return { ok: true }; }); }} className="flex gap-2">
            <input name="photos" type="file" accept="image/*" multiple className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
            <Button size="sm" variant="secondary" disabled={props.isLocked || isUploading}>{isUploading ? 'Uploading…' : 'Upload photos'}</Button>
          </form>
          <form onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const files = form.getAll('afterPhotos').filter((value): value is File => value instanceof File); void doAction(async () => { const uploadedPaths = await uploadPhotoFiles(files, 'after'); return completeJobCard({ jobId: props.jobId, endNote: String(form.get('endNote') || ''), afterPhotoPaths: uploadedPaths }); }); }} className="flex gap-2">
            <input name="endNote" placeholder="Completion note" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
            <input name="afterPhotos" type="file" accept="image/*" multiple className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
            <Button size="sm" disabled={props.isLocked || isUploading}>{isUploading ? 'Uploading…' : 'Complete job'}</Button>
          </form>
          {props.isManager ? <Button size="sm" variant="outline" disabled={props.isLocked} onClick={() => void doAction(async () => { const result = await closeJobCard({ jobId: props.jobId }); if (result.ok && window.confirm('Job card closed. Send invoice now? Click Cancel to send later.')) { window.location.href = `/workshop/vehicles/${props.vehicleId}/documents`; } return result; })}>Close job</Button> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item} className={`rounded-full border px-3 py-1 text-xs ${tab === item ? 'border-black bg-black text-white' : 'border-neutral-200 bg-white text-gray-600'}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-gray-700">
        {tab === 'overview' ? <div className="space-y-2"><p>Status: {formatJobCardStatus(props.status)}</p><p>Progress step: {props.statusProgress + 1} / 5</p><p>Blockers open: {props.blockers.filter((blocker) => !blocker.resolved_at).length}</p><p>Recent timeline: {props.events.slice(0, 5).map((event) => event.event_type).join(', ') || 'No events yet'}</p></div> : null}
        {tab === 'photos' ? <div className="space-y-2">{props.photos.length ? props.photos.map((photo) => <p key={photo.id}>{photo.kind}: {photo.storage_path}</p>) : <p>No photos uploaded.</p>}</div> : null}
        {tab === 'updates' ? <div className="space-y-2">{props.updates.length ? props.updates.map((update) => <p key={update.id}>{update.message}</p>) : <p>No customer updates.</p>}</div> : null}
        {tab === 'internal' ? <div className="space-y-2">{props.events.length ? props.events.map((event) => <p key={event.id}>{event.event_type}: {event.payload?.note ?? ''}</p>) : <p>No internal log yet.</p>}</div> : null}
        {tab === 'parts' ? <div className="space-y-2">{props.parts.length ? props.parts.map((part) => <p key={part.id}>{part.name} × {part.qty} ({part.status})</p>) : <p>No parts yet.</p>}</div> : null}
        {tab === 'approvals' ? <div className="space-y-2">{props.approvals.length ? props.approvals.map((approval) => <p key={approval.id}>{approval.title} - {approval.status}</p>) : <p>No approvals yet.</p>}</div> : null}
        {tab === 'checklist' ? <div className="space-y-2">{props.checklist.length ? props.checklist.map((item) => <p key={item.id}>{item.is_done ? '✅' : '⬜'} {item.label}</p>) : <p>No checklist yet.</p>}</div> : null}
      </div>
    </div>
  );
}
