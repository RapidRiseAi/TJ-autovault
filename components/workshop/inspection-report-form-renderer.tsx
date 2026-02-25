'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

type TemplateField = {
  id: string;
  sort_order: number;
  field_type: 'checkbox' | 'number' | 'text' | 'dropdown';
  label: string;
  required: boolean;
  options: string[] | null;
};

type TemplateRecord = {
  id: string;
  name: string;
  inspection_template_fields: TemplateField[];
};

export function InspectionReportFormRenderer({
  vehicleId,
  technicians,
  onDone
}: {
  vehicleId: string;
  technicians: Array<{ id: string; name: string }>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [mode, setMode] = useState<'digital' | 'upload'>('digital');
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [notes, setNotes] = useState('');
  const [technicianProfileId, setTechnicianProfileId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTemplates() {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch('/api/workshop/inspection-templates');
      if (!response.ok) throw new Error('Could not load templates');
      const body = await response.json();
      setTemplates(body.templates ?? []);
    } catch (templateError) {
      const message = templateError instanceof Error ? templateError.message : 'Could not load templates';
      setError(message);
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates]
  );

  const sortedFields = useMemo(
    () => [...(selectedTemplate?.inspection_template_fields ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [selectedTemplate]
  );

  async function handleGenerate() {
    setError(null);
    if (!technicianProfileId) {
      setError('Technician is required.');
      return;
    }

    if (mode === 'digital') {
      if (!templateId) {
        setError('Select a template first.');
        return;
      }

      for (const field of sortedFields) {
        const value = answers[field.id];
        if (field.required && (value == null || value === '')) {
          setError(`${field.label} is required.`);
          return;
        }
      }

      setIsSubmitting(true);
      try {
        const response = await fetch('/api/workshop/inspection-reports/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId,
            templateId,
            technicianProfileId,
            notes,
            answers
          })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not generate report');
        pushToast({ title: 'Inspection report generated', tone: 'success' });
        onDone?.();
        router.refresh();
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Could not generate report';
        setError(message);
        pushToast({ title: 'Generate failed', description: message, tone: 'error' });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!file) {
      setError('Please choose a report file to upload.');
      return;
    }

    setIsSubmitting(true);
    try {
      const reportId = crypto.randomUUID();
      const signResponse = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          fileName: file.name,
          contentType: file.type,
          kind: 'document',
          documentType: 'inspection_report',
          reportId
        })
      });
      const signedPayload = await signResponse.json();
      if (!signResponse.ok) throw new Error(signedPayload.error ?? 'Sign failed');

      const uploadResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
          body: file
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
          contentType: file.type,
          size: file.size,
          originalName: file.name,
          docType: 'inspection_report',
          subject: 'Inspection report',
          technicianProfileId,
          reportId
        })
      });

      const completeBody = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completeBody.error ?? 'Could not complete upload');

      pushToast({ title: 'Inspection report uploaded', tone: 'success' });
      onDone?.();
      router.refresh();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setError(message);
      pushToast({ title: 'Upload failed', description: message, tone: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded border p-1 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode('digital');
            if (!templates.length) void loadTemplates();
          }}
          className={`rounded px-3 py-1 ${mode === 'digital' ? 'bg-black text-white' : ''}`}
        >
          Digital report
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`rounded px-3 py-1 ${mode === 'upload' ? 'bg-black text-white' : ''}`}
        >
          Upload report
        </button>
      </div>

      {mode === 'digital' ? (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <label className="block flex-1 text-sm font-medium">
              Template
              <select
                className="mt-1 w-full rounded border p-2"
                value={templateId}
                onFocus={() => {
                  if (!templates.length) void loadTemplates();
                }}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <Link href="/workshop/settings/inspection-templates/new" className="rounded border px-3 py-2 text-sm">
              Create template
            </Link>
            <Link href="/workshop/settings/inspection-templates" className="rounded border px-3 py-2 text-sm">
              Manage templates
            </Link>
          </div>

          {isLoadingTemplates ? <p className="text-sm text-gray-500">Loading templates…</p> : null}

          {templateId && !sortedFields.length ? (
            <p className="rounded border border-dashed p-3 text-sm text-gray-600">This template has no fields.</p>
          ) : null}

          {sortedFields.map((field) => (
            <label key={field.id} className="block text-sm font-medium">
              {field.label} {field.required ? <span className="text-red-600">*</span> : null}
              {field.field_type === 'checkbox' ? (
                <select
                  className="mt-1 w-full rounded border p-2"
                  value={String(answers[field.id] ?? '')}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [field.id]: event.target.value === 'ok'
                    }))
                  }
                >
                  <option value="">Select result</option>
                  <option value="ok">OK</option>
                  <option value="issue">Issue</option>
                </select>
              ) : null}
              {field.field_type === 'number' ? (
                <input
                  type="number"
                  className="mt-1 w-full rounded border p-2"
                  value={(answers[field.id] as number | undefined) ?? ''}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [field.id]: Number(event.target.value)
                    }))
                  }
                />
              ) : null}
              {field.field_type === 'text' ? (
                <textarea
                  className="mt-1 w-full rounded border p-2"
                  rows={3}
                  value={(answers[field.id] as string | undefined) ?? ''}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [field.id]: event.target.value
                    }))
                  }
                />
              ) : null}
              {field.field_type === 'dropdown' ? (
                <select
                  className="mt-1 w-full rounded border p-2"
                  value={(answers[field.id] as string | undefined) ?? ''}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [field.id]: event.target.value
                    }))
                  }
                >
                  <option value="">Select option</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : null}
            </label>
          ))}

          <label className="block text-sm font-medium">
            Inspector notes
            <textarea
              className="mt-1 w-full rounded border p-2"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
      ) : (
        <label className="block text-sm font-medium">
          Upload report file
          <input
            type="file"
            className="mt-1 block w-full"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      )}

      <label className="block text-sm font-medium">
        Technician <span className="text-red-600">*</span>
        <select
          className="mt-1 w-full rounded border p-2"
          value={technicianProfileId}
          onChange={(event) => setTechnicianProfileId(event.target.value)}
        >
          <option value="">Select technician</option>
          {technicians.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        disabled={isSubmitting}
        onClick={() => void handleGenerate()}
      >
        {isSubmitting
          ? mode === 'digital'
            ? 'Generating...'
            : 'Uploading...'
          : mode === 'digital'
            ? 'Generate report PDF'
            : 'Upload report'}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
