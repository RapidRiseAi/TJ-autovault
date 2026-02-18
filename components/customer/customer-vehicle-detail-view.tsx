'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown, Ellipsis, FileText, FolderOpen, Gauge, History, MessageSquareWarning, ReceiptText, Wrench } from 'lucide-react';
import { RequestForm, MileageForm, QuoteDecisionButtons, RecommendationDecisionButtons } from '@/components/customer/vehicle-actions';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { UploadsSection } from '@/components/customer/uploads-section';
import { RemoveVehicleButton } from '@/components/customer/remove-vehicle-button';
import { CustomerUploadActions } from '@/components/customer/customer-upload-actions';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
type Invoice = { id: string; status: string | null; payment_status: string | null; total_cents: number; due_date: string | null };
type Request = { id: string; request_type: string | null; status: string | null };
type Recommendation = { id: string; title: string | null; description: string | null; severity: string | null; status: string | null; status_text: string | null };
type Attachment = { id: string; bucket: string | null; storage_path: string | null; original_name: string | null; created_at: string | null; document_type: string | null; subject: string | null; importance: string | null };

function statusBadgeClass(status: string | null) {
  const normalized = (status ?? 'pending').toLowerCase();
  if (normalized.includes('active') || normalized.includes('ready')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (normalized.includes('attention') || normalized.includes('due') || normalized.includes('pending')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (normalized.includes('inactive') || normalized.includes('archived')) return 'bg-gray-200 text-gray-700 border-gray-300';
  return 'bg-slate-200 text-slate-800 border-slate-300';
}

function PremiumAccordion({
  title,
  subtitle,
  count,
  children,
  defaultOpen = false
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-black/10 bg-white p-4 shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-brand-black">{title} <span className="text-sm text-gray-500">({count})</span></p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-2">{children}</div>
    </details>
  );
}

export function CustomerVehicleDetailView({
  vehicle,
  timeline,
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
  timeline: Array<{ id: string; title: string; description: string | null; createdAt: string | null }>;
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
  const [openModal, setOpenModal] = useState<'request' | 'problem' | 'mileage' | 'upload' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  const lastActivity = safeTimeline[0]?.createdAt ?? null;
  const timelineStart = safeTimeline.at(-1)?.createdAt ?? null;

  const pendingQuotes = safeQuotes.filter((quote) => quote.status === 'sent' || quote.status === 'pending').length;
  const unpaidInvoices = safeInvoices.filter((invoice) => invoice.payment_status !== 'paid').length;
  const openRequests = safeRequests.filter((request) => request.status !== 'completed' && request.status !== 'cancelled').length;
  const openRecommendations = safeRecommendations.filter((recommendation) => (recommendation.status_text ?? recommendation.status ?? 'open') === 'open').length;

  const quotePreview = safeQuotes.slice(0, 2);
  const invoicePreview = safeInvoices.slice(0, 2);
  const requestPreview = safeRequests.slice(0, 2);
  const recommendationPreview = safeRecommendations.slice(0, 2);
  const uploadPreview = safeAttachments.slice(0, 2);

  const latestUploadDate = safeAttachments[0]?.created_at;

  const tiles = useMemo(
    () => [
      { label: 'Pending quotes', value: pendingQuotes, icon: MessageSquareWarning },
      { label: 'Unpaid invoices', value: unpaidInvoices, icon: ReceiptText },
      { label: 'Open requests', value: openRequests, icon: Wrench },
      { label: 'Recommendations', value: openRecommendations, icon: Gauge }
    ],
    [openRecommendations, openRequests, pendingQuotes, unpaidInvoices]
  );

  return (
    <div className="space-y-4 pb-3">
      <Card className="bg-gradient-to-br from-[#0c0d11] via-[#17181f] to-[#1f2028] text-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            {vehicle.primary_image_path ? (
              <img
                src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                alt={`${vehicle.registration_number} photo`}
                className="h-24 w-24 rounded-2xl border border-white/20 object-cover"
              />
            ) : (
              <div className="h-24 w-24 rounded-2xl border border-white/20 bg-white/10" />
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-bold tracking-wide">{vehicle.registration_number}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusBadgeClass(vehicle.status)}`}>
                  {vehicle.status ?? 'Pending'}
                </span>
              </div>
              <p className="text-sm text-white/80">{vehicle.make ?? 'Unknown make'} {vehicle.model ?? 'Unknown model'} {vehicle.year ? `(${vehicle.year})` : ''}</p>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Timeline start: {timelineStart ? new Date(timelineStart).toLocaleDateString() : 'N/A'}</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Last activity: {lastActivity ? new Date(lastActivity).toLocaleDateString() : 'N/A'}</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Events: {safeTimeline.length}</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Mileage: {vehicle.odometer_km ? `${vehicle.odometer_km.toLocaleString()} km` : 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            <Button asChild size="sm" className="bg-white text-black hover:bg-gray-100"><Link href={timelineHref}>View timeline</Link></Button>
            <Button asChild size="sm" variant="secondary" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Link href={documentsHref}>Documents</Link></Button>

            <div className="relative">
              <Button size="sm" variant="secondary" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => setMoreOpen((prev) => !prev)}>
                <Ellipsis className="mr-1 h-4 w-4" /> More
              </Button>
              {moreOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-black/15 bg-white p-1 text-sm text-black shadow-xl">
                  <Button asChild variant="ghost" size="sm" className="w-full justify-start"><Link href={editHref}>Edit vehicle</Link></Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpenModal('mileage')}>Update mileage</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpenModal('upload')}>Upload actions</Button>
                  <div className="my-1 border-t" />
                  <Button variant="ghost" size="sm" className="w-full justify-start text-red-700 hover:bg-red-50" onClick={() => document.getElementById('danger-zone')?.scrollIntoView({ behavior: 'smooth' })}>
                    Remove vehicle
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-gray-500">{tile.label}</p>
              <tile.icon className="h-4 w-4 text-gray-500" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-brand-black">{tile.value}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Link href={timelineHref} className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/30 hover:shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Timeline</h3>
            <History className="h-5 w-5 text-brand-black" />
          </div>
          <p className="mt-2 text-sm text-gray-600">Total events: {safeTimeline.length}</p>
          <p className="text-sm text-gray-600">Last activity: {lastActivity ? new Date(lastActivity).toLocaleDateString() : 'No activity yet'}</p>
        </Link>

        <Link href={documentsHref} className="rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/30 hover:shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Documents</h3>
            <FolderOpen className="h-5 w-5 text-brand-black" />
          </div>
          <p className="mt-2 text-sm text-gray-600">Total docs: {safeAttachments.length}</p>
          <p className="text-sm text-gray-600">Last upload: {latestUploadDate ? new Date(latestUploadDate).toLocaleDateString() : 'No uploads yet'}</p>
        </Link>

        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <h3 className="text-lg font-semibold">Quick actions</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Button className="justify-start" onClick={() => setOpenModal('request')}>Create request</Button>
            <Button variant="secondary" className="justify-start" onClick={() => setOpenModal('upload')}>Upload actions</Button>
            <Button variant="secondary" className="justify-start" onClick={() => setOpenModal('problem')}>Report issue</Button>
          </div>
        </div>
      </section>

      <PremiumAccordion title="Quotes" subtitle="Latest quote decisions" count={safeQuotes.length} defaultOpen>
        {quotePreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No quotes available.</p> : null}
        {quotePreview.map((quote) => (
          <div key={quote.id} className="rounded-xl border p-3">
            <p className="text-sm font-medium">{quote.status ?? 'unknown'} · R{(quote.total_cents / 100).toFixed(2)}</p>
            <QuoteDecisionButtons quoteId={quote.id} />
          </div>
        ))}
        {safeQuotes.length > 2 ? <p className="text-xs text-gray-500">Showing top 2 of {safeQuotes.length}.</p> : null}
      </PremiumAccordion>

      <PremiumAccordion title="Invoices" subtitle="Latest billing items" count={safeInvoices.length}>
        {invoicePreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No invoices available.</p> : null}
        {invoicePreview.map((invoice) => (
          <div key={invoice.id} className="rounded-xl border p-3 text-sm">
            <p>{invoice.status ?? 'unknown'} / {invoice.payment_status ?? 'unknown'}</p>
            <p>R{(invoice.total_cents / 100).toFixed(2)} · due {invoice.due_date ?? 'n/a'}</p>
          </div>
        ))}
        <Button asChild size="sm" variant="secondary"><Link href={documentsHref}>View all invoices</Link></Button>
      </PremiumAccordion>

      <PremiumAccordion title="Requests" subtitle="Service and inspection requests" count={safeRequests.length}>
        {requestPreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No requests available.</p> : null}
        {requestPreview.map((request) => <p key={request.id} className="rounded-xl border p-3 text-sm">{request.request_type ?? 'request'} · {request.status ?? 'unknown'}</p>)}
        <Button size="sm" onClick={() => setOpenModal('request')}>View all requests</Button>
      </PremiumAccordion>

      <PremiumAccordion title="Recommendations" subtitle="Items requiring review" count={safeRecommendations.length}>
        {recommendationPreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No recommendations available.</p> : null}
        {recommendationPreview.map((recommendation) => (
          <div key={recommendation.id} className="rounded-xl border p-3 text-sm">
            <p>{recommendation.title ?? 'Recommendation'} · {recommendation.status ?? recommendation.status_text ?? 'open'} · {recommendation.severity ?? 'n/a'}</p>
            {recommendation.description ? <p className="text-xs text-gray-600">{recommendation.description}</p> : null}
            <RecommendationDecisionButtons recommendationId={recommendation.id} />
          </div>
        ))}
      </PremiumAccordion>

      <PremiumAccordion title="Uploads" subtitle="Recent files and history" count={safeAttachments.length}>
        {uploadPreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No uploads available.</p> : null}
        {uploadPreview.map((upload) => <p key={upload.id} className="rounded-xl border p-3 text-sm">{upload.original_name ?? upload.subject ?? 'Unnamed document'}</p>)}
        <UploadsSection vehicleId={vehicle.id} attachments={safeAttachments} />
        <Button size="sm" variant="secondary" onClick={() => setOpenModal('upload')}><FileText className="mr-2 h-4 w-4" />View all uploads</Button>
      </PremiumAccordion>

      <details id="danger-zone" className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <summary className="cursor-pointer text-base font-semibold text-red-900">Danger zone</summary>
        <div className="mt-3 space-y-3">
          <RemoveVehicleButton vehicleId={vehicle.id} />
          <Button asChild variant="secondary" size="sm"><Link href={dashboardHref}>Back to dashboard</Link></Button>
        </div>
      </details>

      <Modal open={openModal === 'request'} onClose={() => setOpenModal(null)} title="Create request">
        <RequestForm vehicleId={vehicle.id} />
      </Modal>
      <Modal open={openModal === 'problem'} onClose={() => setOpenModal(null)} title="Report a problem">
        <ReportIssueForm vehicleId={vehicle.id} />
      </Modal>
      <Modal open={openModal === 'mileage'} onClose={() => setOpenModal(null)} title="Update mileage">
        <MileageForm vehicleId={vehicle.id} />
      </Modal>
      <Modal open={openModal === 'upload'} onClose={() => setOpenModal(null)} title="Upload actions">
        <CustomerUploadActions vehicleId={vehicle.id} />
      </Modal>
    </div>
  );
}

export function CustomerVehicleDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-44 animate-pulse rounded-2xl bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="h-32 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
      {Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}
    </div>
  );
}
