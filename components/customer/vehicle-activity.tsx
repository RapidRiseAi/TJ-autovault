import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { importanceBadgeClass } from '@/lib/timeline';

type TimelineEventItem = {
  id: string;
  created_at: string | null;
  title: string;
  description: string | null;
  importance: string | null;
  actorLabel: string;
  event_type: string;
  metadata?: Record<string, unknown> | null;
};

type DocumentItem = {
  id: string;
  created_at: string | null;
  original_name: string | null;
  subject: string | null;
  document_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  importance: string | null;
};

type ActivityItem = {
  id: string;
  kind: 'timeline' | 'document';
  createdAt: string | null;
  title: string;
  description: string | null;
  importance: string | null;
  actorLabel: string;
  documentType?: string | null;
  downloadHref?: string;
};

function labelDocumentType(type?: string | null) {
  return (type ?? 'other').replaceAll('_', ' ');
}

export function buildActivityStream(timelineRows: TimelineEventItem[], docs: DocumentItem[]): ActivityItem[] {
  const timelineItems: ActivityItem[] = timelineRows.map((event) => ({
    id: event.id,
    kind: 'timeline',
    createdAt: event.created_at,
    title: event.title,
    description: event.description,
    importance: event.importance,
    actorLabel: event.actorLabel
  }));

  const docItems: ActivityItem[] = docs.map((doc) => ({
    id: `doc-${doc.id}`,
    kind: 'document',
    createdAt: doc.created_at,
    title: doc.subject ?? doc.original_name ?? 'Document uploaded',
    description: `Uploaded ${labelDocumentType(doc.document_type)}`,
    importance: doc.importance,
    actorLabel: 'Document upload',
    documentType: doc.document_type,
    downloadHref: doc.storage_path
      ? `/api/uploads/download?bucket=${encodeURIComponent(doc.storage_bucket ?? '')}&path=${encodeURIComponent(doc.storage_path)}`
      : undefined
  }));

  return [...timelineItems, ...docItems].sort((a, b) => {
    const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return right - left;
  });
}

export function RecentActivitySnippet({
  activities,
  maxItems,
  timelineHref,
  emptyLabel = 'No activity yet.'
}: {
  activities: ActivityItem[];
  maxItems?: number;
  timelineHref: string;
  emptyLabel?: string;
}) {
  const items = maxItems ? activities.slice(0, maxItems) : activities;

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="rounded border p-3 text-sm text-gray-600">{emptyLabel}</p> : null}
      {items.map((activity) => (
        <article key={activity.id} className="rounded border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{activity.title}</p>
            <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${importanceBadgeClass(activity.importance)}`}>
              {activity.importance ?? 'info'}
            </span>
            <span className="rounded border bg-gray-50 px-2 py-0.5 text-[10px] uppercase">{activity.kind}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'} · {activity.actorLabel}
          </p>
          {activity.description ? <p className="mt-1 text-sm text-gray-700">{activity.description}</p> : null}
        </article>
      ))}
      <Button asChild variant="outline" size="sm">
        <Link href={timelineHref}>View full timeline</Link>
      </Button>
    </div>
  );
}

export function HorizontalTimeline({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return <p className="rounded border border-dashed p-6 text-sm text-gray-600">No timeline activity for this vehicle yet.</p>;
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <div className="flex min-w-full snap-x snap-mandatory gap-4">
        {activities.map((activity) => (
          <article key={activity.id} className="w-[280px] shrink-0 snap-start rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border bg-gray-50 px-2 py-0.5 text-[10px] uppercase">{activity.kind}</span>
              {activity.documentType ? <span className="rounded border bg-gray-50 px-2 py-0.5 text-[10px] uppercase">{labelDocumentType(activity.documentType)}</span> : null}
              <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${importanceBadgeClass(activity.importance)}`}>
                {activity.importance ?? 'info'}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-semibold">{activity.title}</h3>
            <p className="mt-1 text-xs text-gray-500">
              {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'}
            </p>
            <p className="mt-1 text-xs text-gray-500">{activity.actorLabel}</p>
            {activity.description ? <p className="mt-2 text-sm text-gray-700">{activity.description}</p> : null}
            {activity.downloadHref ? (
              <div className="mt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={activity.downloadHref}>Open document</Link>
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <div className="flex min-w-full gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-44 w-[280px] shrink-0 animate-pulse rounded-lg border bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
