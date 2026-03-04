'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { canCloseJobCard, closeJobCard } from '@/lib/actions/job-cards';
import { InspectionReportFormRenderer } from '@/components/workshop/inspection-report-form-renderer';
import { FinancialDocumentBuilder } from '@/components/workshop/financial-document-builder';

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

export function UploadsActionsForm({
  vehicleId,
  onSuccess,
  destinationLabel = 'customer timeline',
  initialDocumentType,
  initialSubject,
  pendingCloseJobId,
  linkedQuoteId,
  currentMileage,
  technicians = [],
  currentProfileId,
  customerAccountId
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
  customerAccountId?: string | null;
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
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isQuoteOrInvoice =
    documentType === 'quote' || documentType === 'invoice';
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

  const disableSubmit = useMemo(
    () => isSubmitting || !file || !subject.trim() || (isWarning && !body.trim()),
    [body, file, isSubmitting, isWarning, subject]
  );

  async function closePendingJob() {
    if (!pendingCloseJobId || documentType !== 'invoice') return true;

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
      return false;
    }

    const closeResult = await closeJobCard({ jobId: pendingCloseJobId });
    if (!closeResult.ok) {
      pushToast({
        title: 'Invoice created, but job is still open',
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
          urgency: isWarning ? 'high' : urgency
        })
      });
      if (!completeResponse.ok)
        throw new Error(
          (await completeResponse.json()).error ?? 'Could not complete upload'
        );

      pushToast({ title: 'Upload completed', tone: 'success' });
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
      ) : isQuoteOrInvoice ? (
        <FinancialDocumentBuilder
          key={documentType}
          vehicleId={vehicleId}
          kind={documentType === 'quote' ? 'quote' : 'invoice'}
          linkedQuoteId={linkedQuoteId}
          customerAccountId={customerAccountId ?? undefined}
          onDone={() => {
            if (pendingCloseJobId && documentType === 'invoice') {
              void closePendingJob();
            }
            onSuccess?.();
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
              className="mt-1 w-full rounded border p-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Body / notes
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="mt-1 w-full rounded border p-2"
              rows={3}
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
