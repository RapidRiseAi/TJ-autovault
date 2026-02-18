import { importanceBadgeClass } from '@/lib/timeline';

type Attachment = {
  id: string;
  bucket: string | null;
  storage_path: string | null;
  original_name: string | null;
  created_at: string | null;
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
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Uploads</h2>
      <ul className="space-y-2 text-sm">
        {safeAttachments.length === 0 ? <li className="rounded border p-3 text-gray-600">No uploads yet.</li> : null}
        {safeAttachments.map((attachment) => {
          const fallbackName = attachment.storage_path?.split('/').at(-1) ?? 'Untitled upload';
          const label = attachment.subject ?? attachment.original_name ?? fallbackName;
          const createdLabel = attachment.created_at ? new Date(attachment.created_at).toLocaleString() : 'Unknown date';
          const canDownload = Boolean(attachment.storage_path);

          return (
            <li key={attachment.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded border bg-gray-50 px-2 py-0.5 text-[10px] uppercase">{badgeLabel(attachment.document_type)}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${importanceBadgeClass(attachment.importance)}`}>{attachment.importance ?? 'info'}</span>
                  </div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-gray-500">{createdLabel} · {attachment.uploaded_by ?? 'Unknown'}</p>
                </div>
                {canDownload ? (
                  <a href={`/api/uploads/download?bucket=${encodeURIComponent(attachment.bucket ?? '')}&path=${encodeURIComponent(attachment.storage_path ?? '')}`} className="text-brand-red underline">Download</a>
                ) : (
                  <span className="text-xs text-gray-500">File unavailable</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
