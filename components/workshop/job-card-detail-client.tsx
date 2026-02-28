'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import {
  addJobCardEvent,
  canCloseJobCard,
  closeJobCard,
  completeJobCard,
  updateJobCardStatus,
  addJobCardPhoto,
  acceptJobCardAssignment,
  inviteJobCardTechnician
} from '@/lib/actions/job-cards';
import { formatJobCardStatus, JOB_CARD_STATUSES } from '@/lib/job-cards';
import { parseAmountInputToCents } from '@/lib/money';

type Tab =
  | 'overview'
  | 'photos'
  | 'updates'
  | 'internal'
  | 'parts'
  | 'approvals'
  | 'checklist';

type StatusValue = Exclude<(typeof JOB_CARD_STATUSES)[number], 'not_started'>;
const MANUAL_STATUS_OPTIONS: StatusValue[] = JOB_CARD_STATUSES.filter(
  (status) => !['not_started', 'completed', 'closed'].includes(status)
) as StatusValue[];

function centsToInput(cents?: number) {
  if (!cents) return '';
  const whole = Math.floor(cents / 100);
  const decimal = cents % 100;
  if (!decimal) return String(whole);
  return `${whole}.${String(decimal).padStart(2, '0')}`.replace(/0$/, '');
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatTabLabel(value: Tab) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolvePhotoTitle(
  photo: { title: string | null; kind: string },
  index: number
) {
  if (photo.title?.trim()) return photo.title;
  if (photo.kind === 'before') return `Before image ${index + 1}`;
  if (photo.kind === 'after') return `After image ${index + 1}`;
  return `Job image ${index + 1}`;
}

export function JobCardDetailClient(props: {
  jobId: string;
  vehicleId: string;
  isLocked: boolean;
  isManager: boolean;
  viewerRole: 'admin' | 'technician';
  currentProfileId: string;
  technicians: Array<{ id: string; name: string }>;
  assignments: Array<{ id: string; technicianUserId: string; status: string; name: string }>;
  status: string;
  statusProgress: number;
  linkedQuoteId?: string;
  linkedQuoteAmountCents?: number;
  events: Array<{
    id: string;
    event_type: string;
    payload: { note?: string };
    created_at: string;
  }>;
  updates: Array<{ id: string; message: string; created_at: string }>;
  photos: Array<{
    id: string;
    kind: string;
    storage_path: string;
    title: string | null;
    uploaded_at: string;
  }>;
  parts: Array<{
    id: string;
    name: string;
    qty: number;
    status: string;
    eta: string | null;
    notes: string | null;
  }>;
  blockers: Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
    resolved_at: string | null;
  }>;
  approvals: Array<{
    id: string;
    title: string;
    description: string | null;
    estimate_amount: number | null;
    status: string;
    requested_at: string;
  }>;
  checklist: Array<{
    id: string;
    label: string;
    is_required: boolean;
    is_done: boolean;
    done_at: string | null;
  }>;
}) {
  const { pushToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [isUploading, setIsUploading] = useState(false);
  const [isClosingJob, setIsClosingJob] = useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [clientReportModalOpen, setClientReportModalOpen] = useState(false);
  const [uploadPhotoModalOpen, setUploadPhotoModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [requirementsPromptOpen, setRequirementsPromptOpen] = useState(false);

  const [statusDraft, setStatusDraft] = useState<StatusValue>(
    (MANUAL_STATUS_OPTIONS.includes(props.status as never)
      ? props.status
      : 'in_progress') as StatusValue
  );

  const [completeNote, setCompleteNote] = useState('');
  const [completeFiles, setCompleteFiles] = useState<File[]>([]);

  const [requestNote, setRequestNote] = useState('');
  const [requestFile, setRequestFile] = useState<File | null>(null);

  const [reportNote, setReportNote] = useState('');
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [clientReportNote, setClientReportNote] = useState('');

  const [photoUploadTitle, setPhotoUploadTitle] = useState('');
  const [photoUploadFile, setPhotoUploadFile] = useState<File | null>(null);
  const [logNote, setLogNote] = useState('');

  const [invoiceSubject, setInvoiceSubject] = useState('Invoice');
  const [invoiceAmount, setInvoiceAmount] = useState(
    centsToInput(props.linkedQuoteAmountCents)
  );
  const [invoiceAmountPrefilled, setInvoiceAmountPrefilled] = useState(
    Boolean(props.linkedQuoteAmountCents)
  );
  const [invoiceReference, setInvoiceReference] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const hasCompletionStatus = ['ready', 'completed'].includes(props.status);
  const hasCompletionPhoto = props.photos.some(
    (photo) => photo.kind === 'after'
  );
  const unmetCloseRequirements = [
    !hasCompletionStatus ? 'Set the job status to Ready or Completed.' : null,
    !hasCompletionPhoto ? 'Upload at least one completion photo.' : null
  ].filter((requirement): requirement is string => Boolean(requirement));
  const canCloseNow = unmetCloseRequirements.length === 0;

  const tabs: Tab[] = [
    'overview',
    'photos',
    'updates',
    'internal',
    'parts',
    'approvals',
    'checklist'
  ];

  async function doAction(
    run: () => Promise<{ ok: boolean; error?: string }>,
    options?: { reloadOnSuccess?: boolean }
  ) {
    const result = await run();
    if (!result.ok) {
      pushToast({
        title: 'Action failed',
        description: result.error ?? 'Please try again.',
        tone: 'error'
      });
      return false;
    }
    if (options?.reloadOnSuccess ?? true) {
      window.location.reload();
    }
    return true;
  }

  async function uploadPhotoFiles(files: File[], kind: 'before' | 'after') {
    const selectedFiles = files.filter((file) =>
      file.type.startsWith('image/')
    );
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

        const signedPayload = (await signResponse.json()) as {
          bucket: string;
          path: string;
          token: string;
        };
        const uploadResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
          }
        );
        if (!uploadResponse.ok) throw new Error('Could not upload photo');
        paths.push(signedPayload.path);
      }
      return paths;
    } finally {
      setIsUploading(false);
    }
  }

  async function uploadDocument({
    file,
    docType,
    subject,
    body,
    amount,
    referenceNumber,
    dueDate,
    quoteId
  }: {
    file: File;
    docType: 'invoice' | 'report' | 'warning' | 'other';
    subject: string;
    body?: string;
    amount?: string;
    referenceNumber?: string;
    dueDate?: string;
    quoteId?: string;
  }) {
    const signResponse = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId: props.vehicleId,
        fileName: file.name,
        contentType: file.type,
        kind: file.type.startsWith('image/') ? 'image' : 'document',
        documentType: docType
      })
    });
    if (!signResponse.ok) throw new Error('Could not sign upload');

    const signedPayload = (await signResponse.json()) as {
      bucket: string;
      path: string;
      token: string;
      docType: string;
    };

    const uploadResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
        body: file
      }
    );
    if (!uploadResponse.ok) throw new Error('Upload failed');

    const amountCents = amount ? parseAmountInputToCents(amount) : undefined;

    const completeResponse = await fetch('/api/uploads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId: props.vehicleId,
        bucket: signedPayload.bucket,
        path: signedPayload.path,
        contentType: file.type,
        size: file.size,
        originalName: file.name,
        docType: signedPayload.docType,
        subject,
        body,
        amountCents,
        referenceNumber,
        dueDate,
        quoteId
      })
    });

    if (!completeResponse.ok) {
      throw new Error(
        (await completeResponse.json()).error ?? 'Could not complete upload'
      );
    }
  }

  const invoiceDisabled = useMemo(
    () =>
      props.isLocked ||
      isUploading ||
      !invoiceFile ||
      !invoiceSubject.trim() ||
      !invoiceAmount.trim() ||
      !invoiceReference.trim(),
    [
      invoiceAmount,
      invoiceFile,
      invoiceReference,
      invoiceSubject,
      isUploading,
      props.isLocked
    ]
  );

  const openBlockers = props.blockers.filter((blocker) => !blocker.resolved_at);
  const pendingApprovals = props.approvals.filter(
    (approval) => approval.status !== 'approved'
  );
  const afterPhotos = props.photos.filter((photo) => photo.kind === 'after');
  const totalChecklistDone = props.checklist.filter(
    (item) => item.is_done
  ).length;
  const requiredChecklistDone = props.checklist.filter(
    (item) => item.is_required && item.is_done
  ).length;
  const requiredChecklistTotal = props.checklist.filter(
    (item) => item.is_required
  ).length;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((props.statusProgress + 1) / 5) * 100)
  );

  const pendingAssignmentCount = props.assignments.filter((assignment) => assignment.status === 'invited').length;

  const myPendingAssignment =
    props.viewerRole === 'technician'
      ? props.assignments.find(
          (assignment) =>
            assignment.status === 'invited' &&
            assignment.technicianUserId === props.currentProfileId
        )
      : null;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-[0_12px_30px_rgba(17,17,17,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Progress
              </p>
              <p className="mt-1 text-lg font-semibold text-neutral-900">
                {formatJobCardStatus(props.status)}
              </p>
            </div>
            <p className="text-sm text-gray-500">
              Step {props.statusProgress + 1} of 5
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-red-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Open blockers
              </p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {openBlockers.length}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Pending approvals
              </p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {pendingApprovals.length}
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Photos
              </p>
              <p className="mt-1 text-xl font-semibold text-neutral-900">
                {afterPhotos.length} / {props.photos.length}
              </p>
            </div>
          </div>
          {props.isManager && unmetCloseRequirements.length ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Close flow is blocked until required completion steps are done.
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-[0_12px_30px_rgba(17,17,17,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
            Quick actions
          </p>
          <div className="mt-3 space-y-3">
            <div className="space-y-2 rounded-2xl border border-red-100 bg-red-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                Client-visible actions
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setStatusModalOpen(true)}
                >
                  Update status
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setRequestModalOpen(true)}
                >
                  Request approval
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setClientReportModalOpen(true)}
                >
                  Report entry
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setUploadPhotoModalOpen(true)}
                >
                  Upload image
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                Internal workshop actions
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setLogModalOpen(true)}
                >
                  Internal report
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setReportModalOpen(true)}
                >
                  Internal report upload
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() => setCompleteModalOpen(true)}
                >
                  Complete job
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                Technician assignment
              </p>
              <p className="text-xs text-gray-500">
                Pending invites: {pendingAssignmentCount}
              </p>
              <div className="space-y-2">
                {props.assignments.length ? (
                  props.assignments.map((assignment) => (
                    <p key={assignment.id} className="text-xs text-gray-600">
                      {assignment.name} · {assignment.status}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No technician assigned yet.</p>
                )}
              </div>
              {props.viewerRole === 'admin' ? (
                <div className="grid gap-2">
                  <select
                    value={selectedTechnicianId}
                    onChange={(event) => setSelectedTechnicianId(event.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select technician</option>
                    {props.technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedTechnicianId || props.isLocked}
                      onClick={() =>
                        void doAction(async () =>
                          inviteJobCardTechnician({
                            jobId: props.jobId,
                            technicianId: selectedTechnicianId
                          })
                        )
                      }
                    >
                      Invite technician
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!selectedTechnicianId || props.isLocked}
                      onClick={() =>
                        void doAction(async () =>
                          inviteJobCardTechnician({
                            jobId: props.jobId,
                            technicianId: selectedTechnicianId,
                            forceAssign: true
                          })
                        )
                      }
                    >
                      Force assign
                    </Button>
                  </div>
                </div>
              ) : null}
              {myPendingAssignment ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={props.isLocked}
                  onClick={() =>
                    void doAction(() => acceptJobCardAssignment({ jobId: props.jobId }))
                  }
                >
                  Accept assignment
                </Button>
              ) : null}
            </div>
            {props.isManager ? (
              <Button
                size="sm"
                variant="outline"
                disabled={props.isLocked || isClosingJob || isUploading}
                onClick={() => {
                  if (!canCloseNow) {
                    setRequirementsPromptOpen(true);
                    return;
                  }
                  setInvoiceAmount(centsToInput(props.linkedQuoteAmountCents));
                  setInvoiceAmountPrefilled(
                    Boolean(props.linkedQuoteAmountCents)
                  );
                  setInvoiceModalOpen(true);
                }}
              >
                Close & upload invoice
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-neutral-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${tab === item ? 'border-red-200 bg-red-50 text-red-700' : 'border-neutral-200 bg-white text-gray-600 hover:bg-neutral-50'}`}
              onClick={() => setTab(item)}
            >
              {formatTabLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-4 text-sm text-gray-700 shadow-[0_10px_25px_rgba(17,17,17,0.05)] md:p-5">
        {tab === 'overview' ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Current snapshot
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-medium text-neutral-900">
                    {formatJobCardStatus(props.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Open blockers</span>
                  <span className="font-medium text-neutral-900">
                    {openBlockers.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pending approvals</span>
                  <span className="font-medium text-neutral-900">
                    {pendingApprovals.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Checklist completed</span>
                  <span className="font-medium text-neutral-900">
                    {totalChecklistDone}/{props.checklist.length}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Timeline
              </p>
              <div className="mt-2 space-y-2">
                {props.events.length ? (
                  props.events.slice(0, 6).map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-neutral-200 bg-white px-3 py-2"
                    >
                      <p className="text-sm font-medium text-neutral-900">
                        {event.event_type.replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(event.created_at)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No events yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'photos' ? (
          <div className="space-y-2">
            {props.photos.length ? (
              props.photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="rounded-xl border border-neutral-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900">
                        {resolvePhotoTitle(photo, index)}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        {photo.kind}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(photo.uploaded_at)}
                    </p>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/workshop/job-card-photos/${photo.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/workshop/job-card-photos/${photo.id}/download?download=1`}
                      >
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p>No photos uploaded.</p>
            )}
          </div>
        ) : null}

        {tab === 'updates' ? (
          <div className="space-y-2">
            {props.updates.length ? (
              props.updates.map((update) => (
                <div
                  key={update.id}
                  className="rounded-xl border border-neutral-200 px-3 py-2"
                >
                  <p className="text-sm text-neutral-900">{update.message}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDateTime(update.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p>No customer updates.</p>
            )}
          </div>
        ) : null}

        {tab === 'internal' ? (
          <div className="space-y-2">
            {props.events.length ? (
              props.events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-neutral-200 px-3 py-2"
                >
                  <p className="font-medium text-neutral-900">
                    {event.event_type.replaceAll('_', ' ')}
                  </p>
                  <p className="text-sm text-gray-600">
                    {event.payload?.note ?? 'No note'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDateTime(event.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p>No internal log yet.</p>
            )}
          </div>
        ) : null}

        {tab === 'parts' ? (
          <div className="space-y-2">
            {props.parts.length ? (
              props.parts.map((part) => (
                <div
                  key={part.id}
                  className="rounded-xl border border-neutral-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-neutral-900">
                      {part.name} × {part.qty}
                    </p>
                    <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-gray-600">
                      {part.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    ETA: {part.eta ? formatDateTime(part.eta) : 'Not set'}
                  </p>
                  {part.notes ? (
                    <p className="mt-1 text-sm text-gray-600">{part.notes}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p>No parts yet.</p>
            )}
          </div>
        ) : null}

        {tab === 'approvals' ? (
          <div className="space-y-2">
            {props.approvals.length ? (
              props.approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded-xl border border-neutral-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-neutral-900">
                      {approval.title}
                    </p>
                    <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-gray-600">
                      {approval.status}
                    </span>
                  </div>
                  {approval.description ? (
                    <p className="mt-1 text-sm text-gray-600">
                      {approval.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-gray-500">
                    Requested {formatDateTime(approval.requested_at)}
                  </p>
                </div>
              ))
            ) : (
              <p>No approvals yet.</p>
            )}
          </div>
        ) : null}

        {tab === 'checklist' ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
              Required complete:{' '}
              <span className="font-semibold text-neutral-900">
                {requiredChecklistDone}/{requiredChecklistTotal}
              </span>
            </div>
            <div className="space-y-2">
              {props.checklist.length ? (
                props.checklist.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-neutral-200 px-3 py-2"
                  >
                    <p className="font-medium text-neutral-900">
                      {item.is_done ? '✅' : '⬜'} {item.label}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.is_required ? 'Required' : 'Optional'}{' '}
                      {item.done_at
                        ? `• Done ${formatDateTime(item.done_at)}`
                        : ''}
                    </p>
                  </div>
                ))
              ) : (
                <p>No checklist yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Update job status"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void doAction(async () => {
              const result = await updateJobCardStatus({
                jobId: props.jobId,
                status: statusDraft
              });
              if (result.ok) setStatusModalOpen(false);
              return result;
            });
          }}
        >
          <select
            value={statusDraft}
            onChange={(event) =>
              setStatusDraft(event.target.value as StatusValue)
            }
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            {MANUAL_STATUS_OPTIONS.map((status) => (
              <option value={status} key={status}>
                {formatJobCardStatus(status)}
              </option>
            ))}
          </select>
          <Button disabled={props.isLocked}>Save status</Button>
        </form>
      </Modal>

      <Modal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title="Complete job"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void doAction(async () => {
              const uploadedPaths = await uploadPhotoFiles(
                completeFiles,
                'after'
              );
              const result = await completeJobCard({
                jobId: props.jobId,
                endNote: completeNote,
                afterPhotos: uploadedPaths.map((path, index) => ({
                  path,
                  title: `After image ${index + 1}`
                }))
              });
              if (result.ok) setCompleteModalOpen(false);
              return result;
            });
          }}
        >
          <textarea
            placeholder="Completion note (optional)"
            value={completeNote}
            onChange={(event) => setCompleteNote(event.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            rows={3}
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <input
            type="file"
            accept="image/*"
            multiple
            required
            onChange={(event) =>
              setCompleteFiles(
                Array.from(event.target.files ?? []).filter((file) =>
                  file.type.startsWith('image/')
                )
              )
            }
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button disabled={props.isLocked || isUploading}>
            {isUploading ? 'Uploading…' : 'Complete job'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title="Request approval"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setIsUploading(true);
            void (async () => {
              try {
                if (requestFile) {
                  await uploadDocument({
                    file: requestFile,
                    docType: 'warning',
                    subject: 'Approval request from workshop',
                    body: requestNote || 'Approval requested from job card.'
                  });
                }
                const eventResult = await addJobCardEvent({
                  jobId: props.jobId,
                  eventType: 'approval_requested',
                  note:
                    requestNote || 'Approval requested with supporting file.',
                  customerFacing: true
                });
                if (!eventResult.ok) throw new Error(eventResult.error);
                setRequestModalOpen(false);
                window.location.reload();
              } catch (error) {
                pushToast({
                  title: 'Request failed',
                  description:
                    error instanceof Error
                      ? error.message
                      : 'Could not submit request.',
                  tone: 'error'
                });
              } finally {
                setIsUploading(false);
              }
            })();
          }}
        >
          <textarea
            placeholder="Approval request note"
            value={requestNote}
            onChange={(event) => setRequestNote(event.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            rows={3}
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) =>
              setRequestFile(event.target.files?.[0] ?? null)
            }
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button disabled={props.isLocked || isUploading}>
            {isUploading ? 'Uploading…' : 'Send approval request'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={clientReportModalOpen}
        onClose={() => setClientReportModalOpen(false)}
        title="Add report entry"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void doAction(async () => {
              const eventResult = await addJobCardEvent({
                jobId: props.jobId,
                eventType: 'report_entry',
                note: clientReportNote.trim(),
                customerFacing: true
              });

              if (eventResult.ok) {
                setClientReportModalOpen(false);
                setClientReportNote('');
              }
              return eventResult;
            });
          }}
        >
          <textarea
            placeholder="Report entry for the client"
            value={clientReportNote}
            onChange={(event) => setClientReportNote(event.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            rows={4}
            required
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <p className="text-xs text-gray-500">
            This report entry is visible to the client.
          </p>
          <Button disabled={props.isLocked || !clientReportNote.trim()}>
            Save report entry
          </Button>
        </form>
      </Modal>

      <Modal
        open={uploadPhotoModalOpen}
        onClose={() => setUploadPhotoModalOpen(false)}
        title="Upload client image"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!photoUploadFile || !photoUploadTitle.trim()) return;

            setIsUploading(true);
            void (async () => {
              try {
                const [path] = await uploadPhotoFiles(
                  [photoUploadFile],
                  'after'
                );
                if (!path) throw new Error('Could not upload image.');

                const result = await addJobCardPhoto({
                  jobId: props.jobId,
                  kind: 'other',
                  storagePath: path,
                  title: photoUploadTitle.trim()
                });

                if (!result.ok) throw new Error(result.error);

                await addJobCardEvent({
                  jobId: props.jobId,
                  eventType: 'client_image_uploaded',
                  note: photoUploadTitle.trim(),
                  customerFacing: true
                });

                setUploadPhotoModalOpen(false);
                setPhotoUploadFile(null);
                setPhotoUploadTitle('');
                window.location.reload();
              } catch (error) {
                pushToast({
                  title: 'Photo upload failed',
                  description:
                    error instanceof Error
                      ? error.message
                      : 'Please try again.',
                  tone: 'error'
                });
              } finally {
                setIsUploading(false);
              }
            })();
          }}
        >
          <input
            value={photoUploadTitle}
            onChange={(event) => setPhotoUploadTitle(event.target.value)}
            placeholder="Image title"
            required
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <input
            type="file"
            accept="image/*"
            required
            onChange={(event) =>
              setPhotoUploadFile(event.target.files?.[0] ?? null)
            }
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button
            disabled={
              props.isLocked ||
              isUploading ||
              !photoUploadTitle.trim() ||
              !photoUploadFile
            }
          >
            {isUploading ? 'Uploading…' : 'Upload image'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        title="Add internal log entry"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void doAction(async () => {
              const eventResult = await addJobCardEvent({
                jobId: props.jobId,
                eventType: 'internal_note',
                note: logNote.trim(),
                customerFacing: false
              });

              if (eventResult.ok) {
                setLogModalOpen(false);
                setLogNote('');
              }
              return eventResult;
            });
          }}
        >
          <textarea
            placeholder="Internal note for technicians"
            value={logNote}
            onChange={(event) => setLogNote(event.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            rows={4}
            required
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <p className="text-xs text-gray-500">
            This log entry is internal only and is never shown to the client.
          </p>
          <Button disabled={props.isLocked || !logNote.trim()}>
            Save internal log
          </Button>
        </form>
      </Modal>

      <Modal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title="Upload internal report"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setIsUploading(true);
            void (async () => {
              try {
                if (reportFile) {
                  await uploadDocument({
                    file: reportFile,
                    docType: 'other',
                    subject: 'Internal workshop report',
                    body:
                      reportNote || 'Internal report uploaded from job card.'
                  });
                }
                const eventResult = await addJobCardEvent({
                  jobId: props.jobId,
                  eventType: 'internal_note',
                  note: reportNote || 'Internal report file uploaded.',
                  customerFacing: false
                });
                if (!eventResult.ok) throw new Error(eventResult.error);
                setReportModalOpen(false);
                window.location.reload();
              } catch (error) {
                pushToast({
                  title: 'Report failed',
                  description:
                    error instanceof Error
                      ? error.message
                      : 'Could not submit report.',
                  tone: 'error'
                });
              } finally {
                setIsUploading(false);
              }
            })();
          }}
        >
          <textarea
            placeholder="Internal report note"
            value={reportNote}
            onChange={(event) => setReportNote(event.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            rows={3}
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setReportFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button disabled={props.isLocked || isUploading}>
            {isUploading ? 'Uploading…' : 'Upload internal report'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        title="Close job and upload invoice"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invoiceFile || invoiceDisabled) return;

            setIsUploading(true);
            void (async () => {
              try {
                const precheck = await canCloseJobCard({ jobId: props.jobId });
                if (!precheck.ok) {
                  setRequirementsPromptOpen(true);
                  throw new Error(precheck.error);
                }

                await uploadDocument({
                  file: invoiceFile,
                  docType: 'invoice',
                  subject: invoiceSubject.trim(),
                  body: invoiceNote.trim() || undefined,
                  amount: invoiceAmount,
                  referenceNumber: invoiceReference.trim(),
                  dueDate: invoiceDueDate || undefined,
                  quoteId: props.linkedQuoteId
                });

                setIsClosingJob(true);
                const closeResult = await closeJobCard({ jobId: props.jobId });
                setIsClosingJob(false);

                if (!closeResult.ok) {
                  throw new Error(closeResult.error);
                }

                setInvoiceModalOpen(false);
                pushToast({
                  title: 'Invoice uploaded and job closed',
                  tone: 'success'
                });
                window.location.href = `/workshop/vehicles/${props.vehicleId}`;
              } catch (error) {
                pushToast({
                  title: 'Invoice flow failed',
                  description:
                    error instanceof Error
                      ? error.message
                      : 'Please try again.',
                  tone: 'error'
                });
              } finally {
                setIsUploading(false);
                setIsClosingJob(false);
              }
            })();
          }}
        >
          <p className="text-xs text-gray-500">
            Invoice upload is limited to invoice documents only and stays inside
            this job card view.
          </p>
          <input
            value={invoiceSubject}
            onChange={(event) => setInvoiceSubject(event.target.value)}
            placeholder="Invoice subject"
            required
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <input
            type="text"
            value={invoiceAmount}
            onChange={(event) => {
              setInvoiceAmount(event.target.value);
              setInvoiceAmountPrefilled(false);
            }}
            placeholder="Amount"
            required
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className={`w-full rounded-xl border px-3 py-2 text-sm ${invoiceAmountPrefilled ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' : 'border-neutral-300'}`}
          />
          <input
            value={invoiceReference}
            onChange={(event) => setInvoiceReference(event.target.value)}
            placeholder="Invoice reference number"
            required
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={invoiceDueDate}
            onChange={(event) => setInvoiceDueDate(event.target.value)}
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <textarea
            value={invoiceNote}
            onChange={(event) => setInvoiceNote(event.target.value)}
            placeholder="Invoice note (optional)"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            rows={3}
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
          />
          <input
            type="file"
            accept="application/pdf,image/*"
            required
            onChange={(event) =>
              setInvoiceFile(event.target.files?.[0] ?? null)
            }
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
          <Button disabled={invoiceDisabled || isClosingJob}>
            {isUploading || isClosingJob
              ? 'Processing…'
              : 'Upload invoice and close'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={requirementsPromptOpen}
        onClose={() => setRequirementsPromptOpen(false)}
        title="Cannot close job yet"
      >
        <p className="text-sm text-gray-600">
          Complete the following before closing this job:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {unmetCloseRequirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
