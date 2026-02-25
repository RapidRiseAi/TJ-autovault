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
  updateJobCardStatus
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

export function JobCardDetailClient(props: {
  jobId: string;
  vehicleId: string;
  isLocked: boolean;
  isManager: boolean;
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

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
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

  const openBlockers = props.blockers.filter((blocker) => !blocker.resolved_at).length;
  const completionPct = Math.max(0, Math.min(100, ((props.statusProgress + 1) / 5) * 100));

  function statusTone(status: string) {
    if (['completed', 'closed'].includes(status)) return 'text-emerald-700 bg-emerald-100 border-emerald-200';
    if (['ready', 'in_progress'].includes(status)) return 'text-brand-red bg-red-50 border-red-200';
    return 'text-amber-700 bg-amber-100 border-amber-200';
  }

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

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-5 shadow-[0_20px_45px_rgba(17,17,17,0.06)]">
        <div className="flex flex-wrap gap-2">
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
            onClick={() => setLogModalOpen(true)}
          >
            Add log entry
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={props.isLocked}
            onClick={() => setReportModalOpen(true)}
          >
            Internal report
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={props.isLocked}
            onClick={() => setCompleteModalOpen(true)}
          >
            Complete job
          </Button>
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-[0_4px_18px_rgba(17,17,17,0.04)]">
        {tabs.map((item) => (
          <button
            key={item}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${tab === item ? 'border-brand-red bg-brand-red text-white shadow-sm' : 'border-transparent bg-white text-gray-600 hover:border-black/10'}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-gray-700 shadow-[0_12px_28px_rgba(17,17,17,0.04)]">
        {tab === 'overview' ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-xs text-neutral-500">Current status</p>
                <p className="mt-1 font-semibold text-neutral-900">{formatJobCardStatus(props.status)}</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-xs text-neutral-500">Progress</p>
                <p className="mt-1 font-semibold text-neutral-900">{props.statusProgress + 1} of 5 steps</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-xs text-neutral-500">Open blockers</p>
                <p className="mt-1 font-semibold text-neutral-900">{openBlockers}</p>
              </div>
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-xs text-neutral-500">Checklist done</p>
                <p className="mt-1 font-semibold text-neutral-900">
                  {props.checklist.filter((item) => item.is_done).length} / {props.checklist.length || 0}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Recent timeline</p>
              {props.events.length ? (
                <ul className="mt-2 space-y-2">
                  {props.events.slice(0, 5).map((event) => (
                    <li key={event.id} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-700">
                      <span className="font-medium text-neutral-900">{event.event_type.replaceAll('_', ' ')}</span>
                      <span className="ml-2 text-xs text-neutral-500">{new Date(event.created_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">No events yet.</p>
              )}
            </div>
          </div>
        ) : null}
        {tab === 'photos' ? (
          <div className="space-y-2">
            {props.photos.length ? (
              props.photos.map((photo) => (
                <div key={photo.id} className="rounded-xl border border-black/10 bg-white px-3 py-2">
                  <p className="font-medium capitalize text-neutral-900">{photo.kind} photo</p>
                  <p className="text-xs text-neutral-500">{photo.storage_path}</p>
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
                <p key={update.id}>{update.message}</p>
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
                <div key={event.id} className="rounded-xl border border-black/10 bg-white px-3 py-2">
                  <p className="font-medium text-neutral-900">{event.event_type.replaceAll('_', ' ')}</p>
                  <p>{event.payload?.note ?? ''}</p>
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
                <div key={part.id} className="rounded-xl border border-black/10 bg-white px-3 py-2">
                  <p className="font-medium text-neutral-900">{part.name} × {part.qty}</p>
                  <p className="text-xs capitalize text-neutral-600">{part.status}</p>
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
                <div key={approval.id} className="rounded-xl border border-black/10 bg-white px-3 py-2">
                  <p className="font-medium text-neutral-900">{approval.title}</p>
                  <p className="text-xs capitalize text-neutral-600">{approval.status}</p>
                </div>
              ))
            ) : (
              <p>No approvals yet.</p>
            )}
          </div>
        ) : null}
        {tab === 'checklist' ? (
          <div className="space-y-2">
            {props.checklist.length ? (
              props.checklist.map((item) => (
                <p key={item.id}>
                  {item.is_done ? '✅' : '⬜'} {item.label}
                </p>
              ))
            ) : (
              <p>No checklist yet.</p>
            )}
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
                afterPhotoPaths: uploadedPaths
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
            className={`w-full rounded-xl border px-3 py-2 text-sm ${invoiceAmountPrefilled ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200' : 'border-neutral-300'}`}
          />
          <input
            value={invoiceReference}
            onChange={(event) => setInvoiceReference(event.target.value)}
            placeholder="Invoice reference number"
            required
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
