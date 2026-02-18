'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import {
  RequestForm,
  MileageForm,
  QuoteDecisionButtons,
  RecommendationDecisionButtons
} from '@/components/customer/vehicle-actions';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { RemoveVehicleButton } from '@/components/customer/remove-vehicle-button';
import { CustomerUploadActions } from '@/components/customer/customer-upload-actions';
import { HeroHeader } from '@/components/layout/hero-header';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentRing } from '@/components/ui/segment-ring';

type Vehicle = {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  odometer_km: number | null;
  status: string | null;
  next_service_km: number | null;
  next_service_date: string | null;
  primary_image_path: string | null;
};

type Quote = { id: string; status: string | null; total_cents: number };
type Invoice = {
  id: string;
  status: string | null;
  payment_status: string | null;
  total_cents: number;
  due_date: string | null;
  created_at?: string | null;
};
type Request = {
  id: string;
  request_type: string | null;
  status: string | null;
  priority?: string | null;
  created_at?: string | null;
};
type Recommendation = {
  id: string;
  title: string | null;
  description: string | null;
  severity: string | null;
  status: string | null;
  status_text: string | null;
};

type Attachment = {
  id: string;
  bucket: string | null;
  storage_path: string | null;
  original_name: string | null;
  created_at: string | null;
  document_type: string | null;
  subject: string | null;
  importance: string | null;
};

function statusBadgeClass(status: string | null) {
  const normalized = (status ?? 'pending').toLowerCase();
  if (normalized.includes('active') || normalized.includes('ready'))
    return 'bg-white/20 text-white border-white/30';
  if (
    normalized.includes('attention') ||
    normalized.includes('due') ||
    normalized.includes('pending')
  )
    return 'bg-red-500/20 text-red-100 border-red-300/40';
  if (normalized.includes('inactive') || normalized.includes('archived'))
    return 'bg-white/10 text-white/70 border-white/20';
  return 'bg-white/20 text-white border-white/30';
}

const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;

function bucketFromAge(createdAt?: string | null): 'urgent' | 'normal' | 'low' {
  if (!createdAt) return 'normal';
  const ageDays =
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays >= 14) return 'urgent';
  if (ageDays >= 5) return 'normal';
  return 'low';
}

export function CustomerVehicleDetailView({
  vehicle,
  quotes,
  invoices,
  requests,
  recommendations,
  attachments,
  timelineHref,
  documentsHref,
  editHref,
  dashboardHref
}: {
  vehicle: Vehicle;
  timeline: Array<{
    id: string;
    title: string;
    description: string | null;
    createdAt: string | null;
  }>;
  quotes: Quote[];
  invoices: Invoice[];
  requests: Request[];
  recommendations: Recommendation[];
  attachments: Attachment[];
  timelineHref: string;
  documentsHref: string;
  editHref: string;
  dashboardHref: string;
}) {
  const [openModal, setOpenModal] = useState<
    | 'request'
    | 'problem'
    | 'mileage'
    | 'upload'
    | 'quotes'
    | 'invoices'
    | 'recommendations'
    | null
  >(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeRecommendations = Array.isArray(recommendations)
    ? recommendations
    : [];
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  const pendingQuotes = safeQuotes.filter(
    (quote) => quote.status === 'sent' || quote.status === 'pending'
  );
  const pendingQuotesTotalCents = pendingQuotes.reduce(
    (sum, quote) => sum + (quote.total_cents ?? 0),
    0
  );

  const totalInvoicedCents = safeInvoices.reduce(
    (sum, invoice) => sum + (invoice.total_cents ?? 0),
    0
  );
  const outstandingInvoices = safeInvoices.filter(
    (invoice) => invoice.payment_status !== 'paid'
  );
  const outstandingInvoiceTotalCents = outstandingInvoices.reduce(
    (sum, invoice) => sum + (invoice.total_cents ?? 0),
    0
  );
  const outstandingPercent =
    totalInvoicedCents > 0
      ? outstandingInvoiceTotalCents / totalInvoicedCents
      : 0;
  const invoicesAllPaid = outstandingInvoiceTotalCents === 0;

  const openRequests = safeRequests.filter(
    (request) =>
      request.status !== 'completed' && request.status !== 'cancelled'
  );
  const requestBuckets = useMemo(() => {
    const buckets = { urgent: 0, normal: 0, low: 0 };
    openRequests.forEach((request) => {
      const priority = (request.priority ?? '').toLowerCase();
      if (priority === 'urgent' || priority === 'high') {
        buckets.urgent += 1;
      } else if (priority === 'low') {
        buckets.low += 1;
      } else if (priority === 'normal') {
        buckets.normal += 1;
      } else {
        buckets[bucketFromAge(request.created_at)] += 1;
      }
    });
    return buckets;
  }, [openRequests]);

  const openRecommendations = safeRecommendations.filter((recommendation) => {
    const normalized = (
      recommendation.status_text ??
      recommendation.status ??
      ''
    ).toLowerCase();
    return normalized !== 'closed' && normalized !== 'done';
  });

  const recommendationBuckets = useMemo(() => {
    const buckets = { urgent: 0, normal: 0, low: 0 };
    openRecommendations.forEach((recommendation) => {
      const severity = (recommendation.severity ?? '').toLowerCase();
      if (severity === 'high' || severity === 'urgent') buckets.urgent += 1;
      else if (severity === 'low') buckets.low += 1;
      else buckets.normal += 1;
    });
    return buckets;
  }, [openRecommendations]);

  const requestSegments = [
    ...Array.from({ length: requestBuckets.urgent }, () => 'urgent' as const),
    ...Array.from({ length: requestBuckets.normal }, () => 'normal' as const),
    ...Array.from({ length: requestBuckets.low }, () => 'low' as const)
  ];

  const recommendationSegments = [
    ...Array.from(
      { length: recommendationBuckets.urgent },
      () => 'urgent' as const
    ),
    ...Array.from(
      { length: recommendationBuckets.normal },
      () => 'normal' as const
    ),
    ...Array.from({ length: recommendationBuckets.low }, () => 'low' as const)
  ];

  return (
    <div className="space-y-4 pb-3">
      <HeroHeader
        title={vehicle.registration_number}
        subtitle={`${vehicle.make ?? 'Unknown make'} ${vehicle.model ?? 'Unknown model'} ${vehicle.year ? `(${vehicle.year})` : ''}`}
        media={
          vehicle.primary_image_path ? (
            <img
              src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
              alt={`${vehicle.registration_number} photo`}
              className="h-24 w-24 rounded-2xl border border-white/20 object-cover"
            />
          ) : (
            <div className="h-24 w-24 rounded-2xl border border-white/20 bg-white/10" />
          )
        }
        meta={
          <>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusBadgeClass(vehicle.status)}`}
            >
              {vehicle.status ?? 'Pending'}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              Mileage{' '}
              {vehicle.odometer_km
                ? `${vehicle.odometer_km.toLocaleString()} km`
                : 'N/A'}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
              Uploads {safeAttachments.length}
            </span>
          </>
        }
        actions={
          <>
            <Button
              asChild
              size="sm"
              className="bg-white text-black hover:bg-gray-100"
            >
              <Link href={timelineHref}>View timeline</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              <Link href={documentsHref}>Documents</Link>
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={() => setMoreOpen((prev) => !prev)}
              >
                <Ellipsis className="mr-1 h-4 w-4" /> More
              </Button>
              {moreOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-black/15 bg-white p-1 text-sm text-black shadow-xl">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <Link href={editHref}>Edit vehicle</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setOpenModal('mileage')}
                  >
                    Update mileage
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setOpenModal('upload')}
                  >
                    Upload actions
                  </Button>
                  <div className="my-1 border-t" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-red-700 hover:bg-red-50"
                    onClick={() =>
                      document
                        .getElementById('danger-zone')
                        ?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    Remove vehicle
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-4 rounded-3xl">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Quotes
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-semibold text-black">
                  {pendingQuotes.length}
                </span>{' '}
                pending decisions
              </p>
              <p>
                <span className="font-semibold text-black">
                  {money(pendingQuotesTotalCents)}
                </span>{' '}
                pending value
              </p>
            </div>
            <SegmentRing
              mode="count"
              size={110}
              segments={Array.from(
                { length: pendingQuotes.length },
                () => 'urgent'
              )}
              centerLabel={
                pendingQuotes.length > 12 ? '12+' : `${pendingQuotes.length}`
              }
              subLabel="Pending"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpenModal('quotes')}
          >
            View quotes
          </Button>
        </Card>

        <Card
          className={`space-y-4 rounded-3xl ${invoicesAllPaid ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/70'}`}
        >
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Invoices
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span
                  className={`font-semibold ${invoicesAllPaid ? 'text-emerald-700' : 'text-red-700'}`}
                >
                  {money(outstandingInvoiceTotalCents)}
                </span>{' '}
                outstanding
              </p>
              <p>
                <span className="font-semibold text-black">
                  {Math.round(outstandingPercent * 100)}%
                </span>{' '}
                of total invoiced
              </p>
            </div>
            <SegmentRing
              mode="value"
              size={110}
              value={outstandingInvoiceTotalCents}
              total={totalInvoicedCents || 1}
              centerLabel={`${Math.round(outstandingPercent * 100)}%`}
              subLabel="Outstanding"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpenModal('invoices')}
          >
            View invoices
          </Button>
        </Card>

        <Card className="space-y-4 rounded-3xl">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Requests
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-semibold text-black">
                  {openRequests.length}
                </span>{' '}
                open requests
              </p>
              <p className="text-xs">
                Urgent {requestBuckets.urgent} · Normal {requestBuckets.normal}{' '}
                · Low {requestBuckets.low}
              </p>
            </div>
            <SegmentRing
              mode="count"
              size={110}
              segments={requestSegments}
              centerLabel={
                openRequests.length > 12 ? '12+' : `${openRequests.length}`
              }
              subLabel="Open"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpenModal('request')}>
              Create request
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`${timelineHref}?filter=requests`}>
                View in timeline
              </Link>
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 rounded-3xl">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Recommendations
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                <span className="font-semibold text-black">
                  {openRecommendations.length}
                </span>{' '}
                open recommendations
              </p>
              <p className="text-xs">
                Urgent {recommendationBuckets.urgent} · Normal{' '}
                {recommendationBuckets.normal} · Low {recommendationBuckets.low}
              </p>
            </div>
            <SegmentRing
              mode="count"
              size={110}
              segments={recommendationSegments}
              centerLabel={
                openRecommendations.length > 12
                  ? '12+'
                  : `${openRecommendations.length}`
              }
              subLabel="Open"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpenModal('recommendations')}
          >
            View recommendations
          </Button>
        </Card>
      </section>

      <section className="rounded-3xl border border-black/10 bg-white p-5">
        <h3 className="text-lg font-semibold">Quick actions</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            className="justify-start"
            onClick={() => setOpenModal('request')}
          >
            Create request
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() => setOpenModal('upload')}
          >
            Upload actions
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() => setOpenModal('problem')}
          >
            Report issue
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() => setOpenModal('mileage')}
          >
            Update mileage
          </Button>
        </div>
      </section>

      <details
        id="danger-zone"
        className="rounded-3xl border border-red-200 bg-red-50 p-4"
      >
        <summary className="cursor-pointer text-base font-semibold text-red-900">
          Danger zone
        </summary>
        <div className="mt-3 space-y-3">
          <RemoveVehicleButton vehicleId={vehicle.id} />
          <Button asChild variant="secondary" size="sm">
            <Link href={dashboardHref}>Back to dashboard</Link>
          </Button>
        </div>
      </details>

      <Modal
        open={openModal === 'quotes'}
        onClose={() => setOpenModal(null)}
        title="Quotes"
      >
        <div className="space-y-3">
          {safeQuotes.length === 0 ? (
            <p className="text-sm text-gray-600">No quotes available.</p>
          ) : null}
          {safeQuotes.map((quote) => (
            <div
              key={quote.id}
              className="rounded-2xl border border-black/10 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="rounded-full border border-black/15 px-2 py-1 text-xs font-medium uppercase text-gray-600">
                  {quote.status ?? 'unknown'}
                </span>
                <p className="text-lg font-semibold text-black">
                  {money(quote.total_cents ?? 0)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={timelineHref}>View</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={documentsHref}>Download</Link>
                </Button>
                <QuoteDecisionButtons quoteId={quote.id} />
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={openModal === 'invoices'}
        onClose={() => setOpenModal(null)}
        title="Invoices"
      >
        <div className="space-y-3">
          {safeInvoices.length === 0 ? (
            <p className="text-sm text-gray-600">No invoices available.</p>
          ) : null}
          {safeInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="rounded-2xl border border-black/10 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-black">
                    Invoice {invoice.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Due {invoice.due_date ?? 'n/a'}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${invoice.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {invoice.payment_status ?? 'unknown'}
                  </span>
                  <p className="mt-2 text-lg font-semibold text-black">
                    {money(invoice.total_cents ?? 0)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={timelineHref}>View</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={documentsHref}>Download</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={openModal === 'recommendations'}
        onClose={() => setOpenModal(null)}
        title="Recommendations"
      >
        <div className="space-y-3">
          {safeRecommendations.length === 0 ? (
            <p className="text-sm text-gray-600">
              No recommendations available.
            </p>
          ) : null}
          {safeRecommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className="rounded-2xl border border-black/10 p-4 text-sm"
            >
              <p className="font-semibold text-black">
                {recommendation.title ?? 'Recommendation'}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {recommendation.status ?? recommendation.status_text ?? 'open'}{' '}
                · {recommendation.severity ?? 'n/a'}
              </p>
              {recommendation.description ? (
                <p className="mt-2 text-sm text-gray-600">
                  {recommendation.description}
                </p>
              ) : null}
              <div className="mt-2">
                <RecommendationDecisionButtons
                  recommendationId={recommendation.id}
                />
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={openModal === 'request'}
        onClose={() => setOpenModal(null)}
        title="Create request"
      >
        <RequestForm vehicleId={vehicle.id} />
      </Modal>
      <Modal
        open={openModal === 'problem'}
        onClose={() => setOpenModal(null)}
        title="Report a problem"
      >
        <ReportIssueForm vehicleId={vehicle.id} />
      </Modal>
      <Modal
        open={openModal === 'mileage'}
        onClose={() => setOpenModal(null)}
        title="Update mileage"
      >
        <MileageForm vehicleId={vehicle.id} />
      </Modal>
      <Modal
        open={openModal === 'upload'}
        onClose={() => setOpenModal(null)}
        title="Upload actions"
      >
        <CustomerUploadActions vehicleId={vehicle.id} />
      </Modal>
    </div>
  );
}

export function CustomerVehicleDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-44 animate-pulse rounded-3xl bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-28 animate-pulse rounded-3xl bg-gray-100"
          />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-3xl bg-gray-100" />
    </div>
  );
}
