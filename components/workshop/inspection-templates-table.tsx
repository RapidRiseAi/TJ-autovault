'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

type TemplateFieldItem = {
  id: string;
  field_type?: 'checkbox' | 'number' | 'text' | 'dropdown';
  label?: string;
  required?: boolean;
  options?: string[] | null;
};

type TemplateItem = {
  id: string;
  name: string;
  updated_at: string;
  inspection_template_fields: TemplateFieldItem[];
};

export function InspectionTemplatesTable({ templates }: { templates: TemplateItem[] }) {
  const router = useRouter();
  const { pushToast } = useToast();

  async function removeTemplate(templateId: string) {
    const confirmed = window.confirm('Delete this template?');
    if (!confirmed) return;

    const response = await fetch(`/api/workshop/inspection-templates/${templateId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const body = await response.json();
      pushToast({ title: 'Delete failed', description: body.error, tone: 'error' });
      return;
    }

    pushToast({ title: 'Template deleted', tone: 'success' });
    router.refresh();
  }

  async function duplicateTemplate(templateId: string) {
    const source = await fetch(`/api/workshop/inspection-templates/${templateId}`);
    const sourceBody = await source.json();
    if (!source.ok) {
      pushToast({ title: 'Duplicate failed', description: sourceBody.error, tone: 'error' });
      return;
    }

    const template = sourceBody.template;
    const createResponse = await fetch('/api/workshop/inspection-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${template.name} (Copy)`,
        fields: (template.inspection_template_fields ?? []).map((field: TemplateFieldItem) => ({
          field_type: field.field_type ?? 'text',
          label: field.label ?? 'Field',
          required: Boolean(field.required),
          options: Array.isArray(field.options) ? field.options : []
        }))
      })
    });

    const createBody = await createResponse.json();
    if (!createResponse.ok) {
      pushToast({ title: 'Duplicate failed', description: createBody.error, tone: 'error' });
      return;
    }

    pushToast({ title: 'Template duplicated', tone: 'success' });
    router.refresh();
  }

  if (!templates.length) {
    return <p className="rounded border border-dashed p-5 text-sm text-gray-600">No templates yet.</p>;
  }

  return (
    <div className="space-y-2">
      {templates.map((template) => (
        <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
          <div>
            <p className="font-medium">{template.name}</p>
            <p className="text-xs text-gray-500">
              {template.inspection_template_fields?.length ?? 0} fields • Updated {new Date(template.updated_at).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link className="rounded border px-2 py-1" href={`/workshop/settings/inspection-templates/${template.id}/edit`}>
              Edit
            </Link>
            <button type="button" className="rounded border px-2 py-1" onClick={() => void duplicateTemplate(template.id)}>
              Duplicate
            </button>
            <button type="button" className="rounded border px-2 py-1 text-red-700" onClick={() => void removeTemplate(template.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
