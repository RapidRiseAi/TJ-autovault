'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

type FieldType = 'checkbox' | 'number' | 'text' | 'dropdown' | 'section_break';

type TemplateField = {
  field_type: FieldType;
  label: string;
  required: boolean;
  optionsText: string;
  checkboxTwoOptions: boolean;
};

const EMPTY_FIELD: TemplateField = {
  field_type: 'checkbox',
  label: '',
  required: false,
  optionsText: '',
  checkboxTwoOptions: false
};

export function InspectionTemplateBuilder({
  mode,
  templateId,
  initialName,
  initialFields
}: {
  mode: 'create' | 'edit';
  templateId?: string;
  initialName?: string;
  initialFields?: TemplateField[];
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [name, setName] = useState(initialName ?? '');
  const [fields, setFields] = useState<TemplateField[]>(
    initialFields?.length ? initialFields : [EMPTY_FIELD]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(() => name.trim().length > 0 && fields.length > 0, [name, fields.length]);

  async function saveTemplate() {
    setError(null);
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }

    const normalizedFields = fields.map((field) => ({
      field_type: field.field_type,
      label: field.label.trim(),
      required: field.field_type === 'section_break' ? false : field.required,
      options:
        field.field_type === 'dropdown'
          ? field.optionsText
              .split('\n')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : field.field_type === 'checkbox'
            ? { allowCross: field.checkboxTwoOptions }
            : undefined
    }));

    if (normalizedFields.some((field) => !field.label)) {
      setError('Each field needs a label.');
      return;
    }

    if (
      normalizedFields.some(
        (field) => field.field_type === 'dropdown' && !(Array.isArray(field.options) && field.options.length)
      )
    ) {
      setError('Dropdown fields must include at least one option.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        mode === 'create'
          ? '/api/workshop/inspection-templates'
          : `/api/workshop/inspection-templates/${templateId}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            fields: normalizedFields
          })
        }
      );

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Could not save template');
      }

      pushToast({ title: 'Template saved', tone: 'success' });
      router.push('/workshop/settings/inspection-templates');
      router.refresh();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : 'Could not save template';
      setError(message);
      pushToast({ title: 'Save failed', description: message, tone: 'error' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-5">
      <label className="block text-sm font-medium">
        Template name
        <input
          className="mt-1 w-full rounded border p-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={`${index}-${field.field_type}`} className="space-y-2 rounded border p-3">
            <div className="grid gap-2 md:grid-cols-4">
              <select
                value={field.field_type}
                onChange={(event) => {
                  const next = [...fields];
                  const nextType = event.target.value as FieldType;
                  next[index] = {
                    ...next[index],
                    field_type: nextType,
                    optionsText: nextType === 'dropdown' ? next[index].optionsText : '',
                    checkboxTwoOptions:
                      nextType === 'checkbox' ? next[index].checkboxTwoOptions : false,
                    required: nextType === 'section_break' ? false : next[index].required
                  };
                  setFields(next);
                }}
                className="rounded border p-2"
              >
                <option value="checkbox">Checkbox</option>
                <option value="number">Number</option>
                <option value="text">Text</option>
                <option value="dropdown">Dropdown</option>
                <option value="section_break">Section break</option>
              </select>
              <input
                value={field.label}
                onChange={(event) => {
                  const next = [...fields];
                  next[index] = { ...next[index], label: event.target.value };
                  setFields(next);
                }}
                placeholder={field.field_type === 'section_break' ? 'Section heading' : 'Field label'}
                className="rounded border p-2 md:col-span-2"
              />
              <label className="flex items-center gap-2 rounded border p-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  disabled={field.field_type === 'section_break'}
                  onChange={(event) => {
                    const next = [...fields];
                    next[index] = {
                      ...next[index],
                      required: event.target.checked
                    };
                    setFields(next);
                  }}
                />
                Required
              </label>
            </div>
            {field.field_type === 'dropdown' ? (
              <textarea
                value={field.optionsText}
                onChange={(event) => {
                  const next = [...fields];
                  next[index] = {
                    ...next[index],
                    optionsText: event.target.value
                  };
                  setFields(next);
                }}
                rows={3}
                placeholder="One option per line"
                className="w-full rounded border p-2"
              />
            ) : null}
            {field.field_type === 'checkbox' ? (
              <label className="flex items-center gap-2 rounded border p-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.checkboxTwoOptions}
                  onChange={(event) => {
                    const next = [...fields];
                    next[index] = {
                      ...next[index],
                      checkboxTwoOptions: event.target.checked
                    };
                    setFields(next);
                  }}
                />
                Checkbox 2 options (allow ✓ and ✗)
              </label>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                disabled={index === 0}
                onClick={() => {
                  const next = [...fields];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  setFields(next);
                }}
              >
                Move up
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                disabled={index === fields.length - 1}
                onClick={() => {
                  const next = [...fields];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  setFields(next);
                }}
              >
                Move down
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs text-red-700"
                onClick={() => setFields(fields.filter((_, rowIndex) => rowIndex !== index))}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        onClick={() => setFields([...fields, EMPTY_FIELD])}
      >
        Add field
      </button>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="button"
        disabled={!canSave || isSaving}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        onClick={() => void saveTemplate()}
      >
        {isSaving ? 'Saving...' : 'Save template'}
      </button>
    </div>
  );
}
