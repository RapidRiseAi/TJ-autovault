'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { canCloseJobCard, closeJobCard } from '@/lib/actions/job-cards';
import { parseAmountInputToCents } from '@/lib/money';
import { InspectionReportFormRenderer } from '@/components/workshop/inspection-report-form-renderer';

const DOCUMENT_TYPES = [
  {
    value: 'inspection_report',
    label: 'Inspection report',
    defaultSubject: 'Inspection report'
  },
  { value: 'quote', label: 'Quote', defaultSubject: 'Quote' },
  { value: 'invoice', label: 'Invoice', defaultSubject: 'Invoice' },
  { value: 'warning', label: 'Warning', defaultSubject: 'Warning notice' }
] as const;

type DocType = (typeof DOCUMENT_TYPES)[number]['value'];
type Urgency = 'info' | 'low' | 'medium' | 'high' | 'critical';

function formatCentsInput(cents: number) {
  const whole = Math.floor(cents / 100);
  const remainder = cents % 100;
  if (!remainder) return String(whole);
  return `${whole}.${String(remainder).padStart(2, '0')}`.replace(/0$/, '');
}

export function UploadsActionsForm({
  vehicleId,
  onSuccess,
  destinationLabel = 'customer timeline',
  initialDocumentType,
  initialSubject,
  pendingCloseJobId,
  initialAmountCents,
  linkedQuoteId,
  currentMileage,
  technicians = [],
  currentProfileId
}: {
  vehicleId: string;
  onSuccess?: () => void;
  destinationLabel?: string;
  initialDocumentType?: DocType;
  initialSubject?: string;
  pendingCloseJobId?: string;
  initialAmountCents?: number;
  linkedQuoteId?: string;
  currentMileage: number;
  technicians?: Array<{ id: string; name: string }>;
  currentProfileId?: string;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const initialType = initialDocumentType ?? 'inspection_report';
  const [documentType, setDocumentType] = useState<DocType>(initialType);
  const [subject, setSubject] = useState(
    initialSubject ??
      DOCUMENT_TYPES.find((entry) => entry.value === initialType)
        ?.defaultSubject ??
      'Inspection report'
  );
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('info');
  const [amount, setAmount] = useState(() => {
    if (!initialAmountCents) return '';
    return formatCentsInput(initialAmountCents);
  });
  const [amountPrefilled, setAmountPrefilled] = useState(
    Boolean(initialAmountCents && initialType === 'invoice')
  );
  const [referenceNumber, setReferenceNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isQuoteOrInvoice =
    documentType === 'quote' || documentType === 'invoice';
  const isInvoice = documentType === 'invoice';
  const isWarning = documentType === 'warning';
  const isInspectionReport = documentType === 'inspection_report';

  useEffect(() => {
    if (!initialDocumentType) return;
    setDocumentType(initialDocumentType);
    setSubject(
      initialSubject ??
        DOCUMENT_TYPES.find((entry) => entry.value === initialDocumentType)
          ?.defaultSubject ??
        ''
    );
  }, [initialDocumentType, initialSubject]);

  useEffect(() => {
    if (documentType !== 'invoice' || !initialAmountCents) {
      setAmountPrefilled(false);
      return;
    }
    setAmount(formatCentsInput(initialAmountCents));
    setAmountPrefilled(true);
  }, [documentType, initialAmountCents]);

  const disableSubmit = useMemo(
    () =>
      isSubmitting ||
      !file ||
      !subject.trim() ||
      (isQuoteOrInvoice && (!amount || !referenceNumber.trim())) ||
      (isWarning && !body.trim()),
    [
      amount,
      body,
      file,
      isQuoteOrInvoice,
      isSubmitting,
      isWarning,
      referenceNumber,
      subject
    ]
  );

  async function closePendingJob() {
    if (!pendingCloseJobId || documentType !== 'invoice') return true;
    const closeResult = await closeJobCard({ jobId: pendingCloseJobId });
    if (!closeResult.ok) {
      pushToast({
        title: 'Invoice uploaded, but job is still open',
        description: closeResult.error,
        tone: 'error'
      });
      setError(closeResult.error);
      return false;
    }
    return true;
  }

  async function submitUpload(uploadFile: File) {
    setIsSubmitting(true);
    setError(null);

    try {
      const amountCents = isQuoteOrInvoice
        ? parseAmountInputToCents(amount)
        : undefined;
      if (isQuoteOrInvoice && amountCents == null) {
        throw new Error('Invalid amount. Use numbers with up to 2 decimals.');
      }

      if (pendingCloseJobId && documentType === 'invoice') {
        const precheck = await canCloseJobCard({ jobId: pendingCloseJobId });
        if (!precheck.ok) {
          const friendlyMessage =
            precheck.error ===
              'Job must be marked as ready or completed before it can be closed.' ||
            precheck.error ===
              'At least one completion image is required before closing the job.'
              ? 'Please complete the job and upload at least one completion photo before closing.'
              : precheck.error;

          pushToast({
            title: 'Cannot close job yet',
            description: friendlyMessage,
            tone: 'error'
          });
          setError(friendlyMessage);
          return;
        }
      }

      const signResponse = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          fileName: uploadFile.name,
          contentType: uploadFile.type,
          kind: uploadFile.type.startsWith('image/') ? 'image' : 'document',
          documentType
        })
      });
      if (!signResponse.ok)
        throw new Error(
          (await signResponse.json()).error ?? 'Could not sign upload'
        );

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
          headers: { 'Content-Type': uploadFile.type, 'x-upsert': 'true' },
          body: uploadFile
        }
      );
      if (!uploadResponse.ok) throw new Error('Upload failed');

      const completeResponse = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          bucket: signedPayload.bucket,
          path: signedPayload.path,
          contentType: uploadFile.type,
          size: uploadFile.size,
          originalName: uploadFile.name,
          docType: signedPayload.docType,
          subject: subject.trim(),
          body: body.trim() || undefined,
          urgency: isWarning ? 'high' : urgency,
          amountCents,
          referenceNumber: isQuoteOrInvoice
            ? referenceNumber.trim()
            : undefined,
          dueDate: isInvoice && dueDate ? dueDate : undefined,
          quoteId: isInvoice ? linkedQuoteId : undefined
        })
      });
      if (!completeResponse.ok)
        throw new Error(
          (await completeResponse.json()).error ?? 'Could not complete upload'
        );

      const closed = await closePendingJob();
      if (closed && pendingCloseJobId && documentType === 'invoice') {
        pushToast({
          title: 'Invoice uploaded and job closed',
          tone: 'success'
        });
      } else {
        pushToast({ title: 'Upload completed', tone: 'success' });
      }
      onSuccess?.();
      router.refresh();
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Upload failed';
      pushToast({
        title: 'Upload failed',
        description: message,
        tone: 'error'
      });
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setConfirmOpen(true);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">
        Document type
        <select
          value={documentType}
          className="mt-1 w-full rounded border p-2"
          onChange={(event) => {
            const next = event.target.value as DocType;
            setDocumentType(next);
            setSubject(
              DOCUMENT_TYPES.find((entry) => entry.value === next)
                ?.defaultSubject ?? ''
            );
          }}
        >
          {DOCUMENT_TYPES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      {isInspectionReport ? (
        <InspectionReportFormRenderer
          vehicleId={vehicleId}
          currentMileage={currentMileage}
          technicians={technicians}
          currentProfileId={currentProfileId}
          onDone={() => {
            onSuccess?.();
            router.refresh();
          }}
        />
      ) : (
        <>
          <label className="block text-sm font-medium">
            Urgency
            <select
              value={urgency}
              onChange={(event) => setUrgency(event.target.value as Urgency)}
              className="mt-1 w-full rounded border p-2"
            >
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Subject
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              className="mt-1 w-full rounded border p-2"
            />
          </label>
          {isQuoteOrInvoice ? (
            <label className="block text-sm font-medium">
              Amount
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  if (amountPrefilled) {
                    setAmountPrefilled(false);
                  }
                }}
                required
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className={`mt-1 w-full rounded border p-2 transition ${
                  amountPrefilled
                    ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                    : ''
                }`}
                placeholder="0"
              />
              {amountPrefilled ? (
                <p className="mt-1 text-xs text-amber-700">
                  Prefilled from the linked quote amount.
                </p>
              ) : null}
            </label>
          ) : null}
          {isQuoteOrInvoice ? (
            <label className="block text-sm font-medium">
              {documentType === 'invoice'
                ? 'Invoice reference number'
                : 'Quote reference number'}
              <input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                required
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="mt-1 w-full rounded border p-2"
                placeholder={
                  documentType === 'invoice' ? 'INV-0001' : 'QTE-0001'
                }
              />
            </label>
          ) : null}
          {isInvoice ? (
            <label className="block text-sm font-medium">
              Due date (optional)
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
          ) : null}
          <label className="block text-sm font-medium">
            Body / notes
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="mt-1 w-full rounded border p-2"
              rows={3}
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
            />
          </label>
          <label className="block text-sm font-medium">
            File
            <input
              type="file"
              accept="application/pdf,image/*"
              required
              className="mt-1 block w-full text-sm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="submit"
            disabled={disableSubmit}
            className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Uploading...' : 'Upload file'}
          </button>
        </>
      )}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm upload"
      >
        <div className="space-y-4 text-sm">
          <p>Upload this file?</p>
          <dl className="space-y-1 rounded border border-black/10 bg-zinc-50 p-3">
            <div>
              <dt className="font-medium">File name</dt>
              <dd>{file?.name ?? 'Unknown file'}</dd>
            </div>
            <div>
              <dt className="font-medium">Upload type</dt>
              <dd>
                {DOCUMENT_TYPES.find((entry) => entry.value === documentType)
                  ?.label ?? documentType}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Destination</dt>
              <dd>{destinationLabel}</dd>
            </div>
          </dl>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || !file}
              className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
              onClick={() => {
                if (!file) return;
                setConfirmOpen(false);
                void submitUpload(file);
              }}
            >
              Confirm upload
            </button>
          </div>
        </div>
      </Modal>
    </form>
  );
}
