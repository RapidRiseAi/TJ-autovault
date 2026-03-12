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
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentRing, type RingSegment } from '@/components/ui/segment-ring';
import { RingChart } from '@/components/ui/ring-chart';
import { LogSomethingModal } from '@/components/customer/log-something-modal';
import { SendMessageModal } from '@/components/messages/send-message-modal';

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

type Quote = {
  id: string;
  status: string | null;
  total_cents: number;
  created_at: string | null;
};
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

const money = (cents: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2
  }).format((cents ?? 0) / 100);

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
  dashboardHref,
  customerVehiclesForMessage
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
  customerVehiclesForMessage: Array<{ id: string; registration_number: string | null }>;
}) {
  const [openModal, setOpenModal] = useState<
    | 'request'
    | 'problem'
    | 'mileage'
    | 'upload'
    | 'log'
    | 'quotes'
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
  const paidInvoices = safeInvoices.filter(
    (invoice) => invoice.payment_status === 'paid'
  );
  const outstandingInvoiceTotalCents = outstandingInvoices.reduce(
    (sum, invoice) => sum + (invoice.total_cents ?? 0),
    0
  );
  const paidInvoiceTotalCents = paidInvoices.reduce(
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
    return normalized === 'open' || normalized === 'acknowledged';
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

  const now = new Date();
  const invoiceBuckets = safeInvoices.reduce(
    (buckets, invoice) => {
      if (invoice.payment_status === 'paid') {
        buckets.paid += 1;
        return buckets;
      }
      const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
      if (dueDate && dueDate.getTime() < now.getTime()) {
        buckets.overdueOrOutstanding += 1;
      } else {
        buckets.unpaid += 1;
      }
      return buckets;
    },
    { overdueOrOutstanding: 0, unpaid: 0, paid: 0 }
  );

  const quoteSegmentPalette = ['#dc2626', '#111111', '#a1a1aa'];
  const pendingQuoteValueTotal = pendingQuotes.reduce(
    (sum, quote) => sum + (quote.total_cents ?? 0),
    0
  );
  const pendingQuoteSegments =
    pendingQuotes.length > 0
      ? pendingQuotes.map((quote, index) => ({
          value: pendingQuoteValueTotal > 0 ? (quote.total_cents ?? 0) : 1,
          color: quoteSegmentPalette[index % quoteSegmentPalette.length]
        }))
      : [{ value: 1, color: '#d4d4d8' }];

  const requestSegments: RingSegment[] = [
    { value: requestBuckets.urgent, tone: 'negative' },
    { value: requestBuckets.normal, tone: 'neutral' },
    { value: requestBuckets.low, tone: 'positive' }
  ];

  const recommendationSegments: RingSegment[] = [
    { value: recommendationBuckets.urgent, tone: 'negative' },
    { value: recommendationBuckets.normal, tone: 'neutral' },
    { value: recommendationBuckets.low, tone: 'positive' }
  ];

  const invoiceSegments: RingSegment[] = [
    { value: invoiceBuckets.overdueOrOutstanding, tone: 'negative' },
    { value: invoiceBuckets.unpaid, tone: 'neutral' },
    { value: invoiceBuckets.paid, tone: 'positive' }
  ];

  return (
    <div className="space-y-4 pb-3">
      <section className="rounded-3xl border border-black/10 bg-gradient-to-br from-black via-[#151515] to-[#262626] p-3 text-white shadow-[0_16px_50px_rgba(0,0,0,0.28)] sm:p-5">
        <div className="space-y-2.5">
          <div className="flex items-start gap-3">
            {vehicle.primary_image_path ? (
              <img
                src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                alt={`${vehicle.registration_number} photo`}
                className="h-20 w-20 rounded-2xl border border-white/20 object-cover sm:h-24 sm:w-24"
              />
            ) : (
              <div className="h-20 w-20 rounded-2xl border border-white/20 bg-white/10 sm:h-24 sm:w-24" />
            )}
            <div className="flex min-h-20 flex-1 flex-col justify-between sm:min-h-24">
              <h1 className="truncate text-[2.35rem] font-bold leading-[0.95] tracking-tight sm:text-[2.6rem]">
                {vehicle.registration_number}
              </h1>
              <p className="truncate text-xl font-medium leading-none text-white/85 sm:text-2xl">
                {vehicle.make ?? 'Unknown make'} {vehicle.model ?? 'Unknown model'} {vehicle.year ? `(${vehicle.year})` : ''}
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            <span
              className={`flex h-14 flex-col items-center justify-center rounded-full border px-2 text-center text-[11px] ${statusBadgeClass(vehicle.status)}`}
            >
              <span className="text-[10px] uppercase tracking-[0.11em] text-white/70">Status</span>
              <span className="font-semibold uppercase leading-none">{vehicle.status ?? 'Pending'}</span>
            </span>
            <span className="flex h-14 flex-col items-center justify-center rounded-full border border-white/20 bg-white/10 px-2 text-center text-[11px]">
              <span className="text-[10px] uppercase tracking-[0.11em] text-white/70">Mileage</span>
              <span className="font-semibold leading-none">{vehicle.odometer_km ? `${vehicle.odometer_km.toLocaleString()} km` : 'N/A'}</span>
            </span>
            <span className="flex h-14 flex-col items-center justify-center rounded-full border border-white/20 bg-white/10 px-2 text-center text-[11px]">
              <span className="text-[10px] uppercase tracking-[0.11em] text-white/70">Uploads</span>
              <span className="font-semibold leading-none">{safeAttachments.length}</span>
            </span>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <span className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-center text-xs font-semibold text-emerald-100 sm:min-h-9">
              Total spent {money(paidInvoiceTotalCents)}
            </span>
            <SendMessageModal
              vehicles={customerVehiclesForMessage}
              defaultVehicleId={vehicle.id}
              triggerClassName="w-full border-white/30 bg-white/10 text-white hover:bg-white/20 sm:w-auto"
            />
            <Button
              asChild
              size="sm"
              className="w-full min-h-10 bg-white text-black hover:bg-gray-100 sm:w-auto"
            >
              <Link href={timelineHref}>View timeline</Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="w-full min-h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:w-auto"
              onClick={() => setOpenModal('log')}
            >
              Log something
            </Button>
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="w-full min-h-10 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:w-auto"
            >
              <Link href={documentsHref}>Documents</Link>
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                className="w-full min-h-10 border-white/30 bg-white/10 px-4 text-base text-white hover:bg-white/20 sm:w-auto sm:text-sm"
                onClick={() => setMoreOpen((prev) => !prev)}
              >
                <Ellipsis className="mr-1 h-4 w-4" /> More
              </Button>
              {moreOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-black/15 bg-white p-1 text-sm text-black shadow-xl">
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
          </div>
        </div>
      </section>

      <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 sm:hidden">Swipe metrics →</div>

      <section className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        <Card className="w-[64vw] shrink-0 snap-start space-y-2 rounded-3xl border-black/10 bg-gradient-to-br from-white to-neutral-50 p-4 sm:w-auto">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Quotes
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex flex-col items-center gap-1">
              <RingChart
                size={64}
                strokeWidth={4}
                segments={pendingQuoteSegments}
                centerLabel={`${pendingQuotes.length}`}
              />
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500">Pending</p>
            </div>
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
          className={`w-[64vw] shrink-0 snap-start space-y-2 rounded-3xl p-4 sm:w-auto ${invoicesAllPaid ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white' : 'border-red-200 bg-gradient-to-br from-red-50/70 to-white'}`}
        >
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Invoices
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              <p>
                <span className="font-semibold text-emerald-700">
                  {money(paidInvoiceTotalCents)}
                </span>{' '}
                total spent
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <SegmentRing
                size={64}
                total={safeInvoices.length || 1}
                segments={invoiceSegments}
                centerLabel={`${Math.round(outstandingPercent * 100)}%`}
              />
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500">Outstanding</p>
            </div>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/customer/invoices?vehicleId=${vehicle.id}`}>
              View invoices
            </Link>
          </Button>
        </Card>

        <Card className="w-[64vw] shrink-0 snap-start space-y-2 rounded-3xl border-black/10 bg-gradient-to-br from-white to-neutral-50 p-4 sm:w-auto">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Requests
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex flex-col items-center gap-1">
              <SegmentRing
                size={64}
                total={openRequests.length || 1}
                segments={requestSegments}
                centerLabel={`${openRequests.length}`}
              />
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500">Open</p>
            </div>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap">
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

        <Card className="w-[64vw] shrink-0 snap-start space-y-2 rounded-3xl border-black/10 bg-gradient-to-br from-white to-neutral-50 p-4 sm:w-auto">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Recommendations
          </p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex flex-col items-center gap-1">
              <SegmentRing
                size={64}
                total={openRecommendations.length || 1}
                segments={recommendationSegments}
                centerLabel={`${openRecommendations.length}`}
              />
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500">Open</p>
            </div>
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
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Button
            className="justify-start"
            onClick={() => setOpenModal('request')}
          >
            Create request
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() => setOpenModal('log')}
          >
            Log something
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
          {safeQuotes.map((quote) => {
            const normalizedStatus = (quote.status ?? 'sent').toLowerCase();
            const statusClass =
              normalizedStatus === 'approved'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : normalizedStatus === 'declined'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-black/15 bg-gray-50 text-gray-700';

            return (
              <div
                key={quote.id}
                className="rounded-2xl border border-black/10 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusClass}`}
                  >
                    {quote.status ?? 'sent'}
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
                  <QuoteDecisionButtons
                    quoteId={quote.id}
                    status={quote.status}
                    amountLabel={money(quote.total_cents ?? 0)}
                    createdAt={quote.created_at}
                    quoteRef={`#${quote.id.slice(0, 8).toUpperCase()}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={openModal === 'recommendations'}
        onClose={() => setOpenModal(null)}
        title="Recommendations"
      >
        <div className="space-y-3">
          {openRecommendations.length === 0 ? (
            <p className="text-sm text-gray-600">
              No actionable recommendations available.
            </p>
          ) : null}
          {openRecommendations.map((recommendation) => (
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
        <MileageForm vehicleId={vehicle.id} currentMileage={vehicle.odometer_km ?? 0} />
      </Modal>
      <LogSomethingModal
        vehicleId={vehicle.id}
        open={openModal === 'log'}
        onClose={() => setOpenModal(null)}
      />
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
