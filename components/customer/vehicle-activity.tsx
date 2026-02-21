'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ReceiptText, Wrench, CircleDollarSign, Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { importanceBadgeClass } from '@/lib/timeline';
import type { ActivityItem } from '@/lib/activity-stream';
import { requestTimelineItemDeletion, reviewTimelineItemDeletion } from '@/lib/actions/timeline';

function iconForCategory(category: ActivityItem['category']) {
  if (category === 'requests') return Wrench;
  if (category === 'quotes') return CircleDollarSign;
  if (category === 'invoices') return ReceiptText;
  if (category === 'uploads') return FileText;
  if (category === 'recommendations') return Sparkles;
  return ShieldCheck;
}

type DeletionRequest = {
  id: string;
  target_kind: 'timeline' | 'document';
  target_id: string;
  requested_by_role: 'customer' | 'workshop';
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
};

export function WorldTimeline({ activities, vehicleId, viewerRole, deletionRequests = [], highlightedDeletionRequestId }: { activities: ActivityItem[]; vehicleId?: string; viewerRole?: 'customer' | 'workshop'; deletionRequests?: DeletionRequest[]; highlightedDeletionRequestId?: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | ActivityItem['category']>('all');
  const [visibleCount, setVisibleCount] = useState(12);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [deletionReason, setDeletionReason] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const filtered = useMemo(() => {
    if (filter === 'all') return activities;
    return activities.filter((item) => item.category === filter);
  }, [activities, filter]);

  const visible = filtered.slice(0, visibleCount);
  const pendingRequests = deletionRequests.filter((request) => request.status === 'pending');
  const highlightedRequest = highlightedDeletionRequestId
    ? deletionRequests.find((request) => request.id === highlightedDeletionRequestId)
    : undefined;

  useEffect(() => {
    if (!highlightedRequest) return;
    const highlightedElement = document.querySelector('[data-highlighted-deletion="true"]');
    highlightedElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedRequest]);

  async function submitDeletionRequest() {
    if (!vehicleId || !selectedActivity || !deletionReason.trim()) return;
    const result = await requestTimelineItemDeletion({
      vehicleId,
      targetKind: selectedActivity.kind,
      targetId: selectedActivity.targetId,
      reason: deletionReason.trim()
    });
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setIsDeleteModalOpen(false);
    setDeletionReason('');
    setDeleteError('');
    router.refresh();
  }

  async function reviewDeletion(requestId: string, approve: boolean) {
    if (!vehicleId) return;
    await reviewTimelineItemDeletion({ vehicleId, requestId, approve });
    router.refresh();
  }

  if (activities.length === 0) {
    return <p className="rounded border border-dashed p-6 text-sm text-gray-600">No timeline activity for this vehicle yet.</p>;
  }

  const chips: Array<{ key: 'all' | ActivityItem['category']; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'requests', label: 'Requests' },
    { key: 'quotes', label: 'Quotes' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'uploads', label: 'Uploads' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'system', label: 'System' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Button key={chip.key} size="sm" variant={filter === chip.key ? 'primary' : 'secondary'} onClick={() => { setFilter(chip.key); setVisibleCount(12); }}>
            {chip.label}
          </Button>
        ))}
      </div>

      {highlightedRequest ? (
        <p className="rounded border border-brand-red/40 bg-brand-red/5 px-3 py-2 text-xs text-brand-red">
          Highlighting deletion request: {highlightedRequest.reason?.trim() || 'No reason provided'}
        </p>
      ) : null}

      <div className="relative">
        <div className="absolute left-3 top-0 h-full w-px bg-black/15 md:left-1/2 md:-translate-x-1/2" />
        <div className="space-y-4">
          {visible.map((activity, index) => {
            const Icon = iconForCategory(activity.category);
            const right = index % 2 === 0;
            return (
              <div key={activity.id} className={`relative pl-10 md:grid md:grid-cols-2 md:pl-0 ${right ? '' : 'md:[&>*:first-child]:order-2'}`}>
                <span className="absolute left-[7px] top-6 z-10 h-2.5 w-2.5 rounded-full bg-brand-red md:left-1/2 md:-translate-x-1/2" />
                <article
                  data-highlighted-deletion={highlightedRequest?.target_kind === activity.kind && highlightedRequest?.target_id === activity.targetId}
                  className={`rounded-xl border bg-white p-4 shadow-sm md:mx-6 ${highlightedRequest?.target_kind === activity.kind && highlightedRequest?.target_id === activity.targetId ? 'border-brand-red ring-2 ring-brand-red/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-brand-red" /><h3 className="text-sm font-semibold">{activity.title}</h3></div>
                    <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${importanceBadgeClass(activity.importance)}`}>{activity.importance ?? 'info'}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{activity.subtitle}</p>
                  <p className="mt-1 text-xs text-gray-500">{activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'} · {activity.actorLabel}</p>
                  {activity.description ? <p className="mt-2 text-sm text-gray-700">{activity.description}</p> : null}
                  {activity.downloadHref || activity.actionHref ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activity.downloadHref ? <Button asChild size="sm" variant="outline"><Link href={activity.downloadHref}>Preview</Link></Button> : null}
                      {activity.downloadHref ? <Button asChild size="sm" variant="outline"><Link href={activity.downloadHref} download>Download</Link></Button> : null}
                      {activity.actionHref ? <Button asChild size="sm"><Link href={activity.actionHref}>{activity.actionLabel ?? 'Open details'}</Link></Button> : null}
                    </div>
                  ) : null}
                  {vehicleId && viewerRole ? (
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const pendingRequest = pendingRequests.find((request) => request.target_kind === activity.kind && request.target_id === activity.targetId);
                        if (!pendingRequest) {
                          return <Button size="sm" variant="outline" onClick={() => { setSelectedActivity(activity); setIsDeleteModalOpen(true); }}>Request deletion</Button>;
                        }
                        if (pendingRequest.requested_by_role === viewerRole) {
                          return <p className="text-xs text-amber-700">Deletion request pending approval from the other party.</p>;
                        }
                        return (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => void reviewDeletion(pendingRequest.id, true)}>Approve deletion</Button>
                            <Button size="sm" variant="outline" onClick={() => void reviewDeletion(pendingRequest.id, false)}>Reject</Button>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </article>
              </div>
            );
          })}
        </div>
      </div>

      {visibleCount < filtered.length ? (
        <div className="flex justify-center"><Button variant="secondary" onClick={() => setVisibleCount((prev) => prev + 12)}>Load more</Button></div>
      ) : null}
      {filtered.length === 0 ? <p className="text-sm text-gray-500">No events for this filter.</p> : null}

      <ConfirmModal
        open={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setDeleteError(''); }}
        title="Request deletion"
        description="Deleting an item requires approval from the other party."
        onConfirm={() => void submitDeletionRequest()}
        confirmLabel="Send request"
      >
        <p className="text-xs text-gray-600">Item: {selectedActivity?.title ?? 'Unknown item'}</p>
        <textarea value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} rows={3} className="w-full rounded border p-2 text-sm" placeholder="Reason for deletion request" />
        {deleteError ? <p className="text-xs text-red-700">{deleteError}</p> : null}
      </ConfirmModal>
    </div>
  );
}

export function TimelineSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}</div>;
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
          <p className="text-sm font-medium">{activity.title}</p>
          <p className="text-xs text-gray-500">{activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Unknown date'} · {activity.actorLabel}</p>
        </article>
      ))}
      <Button asChild variant="outline" size="sm"><Link href={timelineHref}>View full timeline</Link></Button>
    </div>
  );
}

export function HorizontalTimeline({ activities, vehicleId, viewerRole, deletionRequests, highlightedDeletionRequestId }: { activities: ActivityItem[]; vehicleId?: string; viewerRole?: 'customer' | 'workshop'; deletionRequests?: DeletionRequest[]; highlightedDeletionRequestId?: string }) {
  return <WorldTimeline activities={activities} vehicleId={vehicleId} viewerRole={viewerRole} deletionRequests={deletionRequests} highlightedDeletionRequestId={highlightedDeletionRequestId} />;
}
