import Link from 'next/link';
import { Button } from '@/components/ui/button';

type TimelineItem = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string | null;
};

export function MiniTimeline({
  items,
  startDate,
  lastUpdated,
  timelineHref
}: {
  items: TimelineItem[];
  startDate: string;
  lastUpdated: string;
  timelineHref: string;
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
        <p>Start date: <span className="font-medium text-brand-black">{startDate}</span></p>
        <p>Last updated: <span className="font-medium text-brand-black">{lastUpdated}</span></p>
      </div>

      {safeItems.length ? (
        <ol className="space-y-3">
          {safeItems.map((item) => (
            <li key={item.id} className="relative pl-6">
              <span className="absolute left-2 top-1 h-full w-px bg-gray-200" />
              <span className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-brand-red bg-white" />
              <p className="text-sm font-medium text-brand-black">{item.title}</p>
              <p className="text-xs text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown date'}</p>
              {item.description ? <p className="text-sm text-gray-700">{item.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-gray-600">No activity yet.</p>
      )}

      <Button asChild variant="secondary" size="sm">
        <Link href={timelineHref}>View full timeline</Link>
      </Button>
    </div>
  );
}
