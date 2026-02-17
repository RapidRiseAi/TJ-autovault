import { importanceBadgeClass } from '@/lib/timeline';

type Attachment = {
  id: string;
  bucket: string | null;
  storage_path: string;
  original_name: string | null;
  created_at: string;
  document_type?: string | null;
  subject?: string | null;
  importance?: string | null;
  uploaded_by?: string | null;
};

function badgeLabel(value?: string | null) {
  if (!value) return 'other';
  return value.replaceAll('_', ' ');
}

export function UploadsSection({ attachments }: { vehicleId: string; attachments: Attachment[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Uploads</h2>
      <ul className="space-y-2 text-sm">
        {attachments.length === 0 ? <li className="rounded border p-3 text-gray-600">No uploads yet.</li> : null}
        {attachments.map((attachment) => (
          <li key={attachment.id} className="rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded border bg-gray-50 px-2 py-0.5 text-[10px] uppercase">{badgeLabel(attachment.document_type)}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${importanceBadgeClass(attachment.importance)}`}>{attachment.importance ?? 'info'}</span>
                </div>
                <p className="font-medium">{attachment.subject ?? attachment.original_name ?? attachment.storage_path.split('/').at(-1)}</p>
                <p className="text-xs text-gray-500">{new Date(attachment.created_at).toLocaleString()} · {attachment.uploaded_by ?? 'Unknown'}</p>
              </div>
              <a href={`/api/uploads/download?bucket=${encodeURIComponent(attachment.bucket ?? '')}&path=${encodeURIComponent(attachment.storage_path)}`} className="text-brand-red underline">Download</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
