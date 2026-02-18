'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { RequestForm, MileageForm, QuoteDecisionButtons, RecommendationDecisionButtons } from '@/components/customer/vehicle-actions';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
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

function StatDonut({ value, total, color = '#dc2626' }: { value: number; total: number; color?: string }) {
  const pct = total <= 0 ? 0 : Math.min(100, Math.round((value / total) * 100));
  return (
    <div
      className="h-12 w-12 rounded-full"
      style={{ background: `conic-gradient(${color} ${pct}%, #e5e7eb ${pct}% 100%)` }}
      aria-hidden
    >
      <div className="m-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-gray-700">{pct}%</div>
    </div>
  );
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
  const [openModal, setOpenModal] = useState<'request' | 'problem' | 'mileage' | 'upload' | 'quotes' | 'invoices' | 'requests' | 'recommendations' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];
  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  const pendingQuotes = safeQuotes.filter((quote) => quote.status === 'sent' || quote.status === 'pending');
  const pendingQuotesTotalCents = pendingQuotes.reduce((sum, quote) => sum + (quote.total_cents ?? 0), 0);
  const outstandingInvoices = safeInvoices.filter((invoice) => invoice.payment_status !== 'paid');
  const outstandingInvoiceTotalCents = outstandingInvoices.reduce((sum, invoice) => sum + (invoice.total_cents ?? 0), 0);
  const openRequests = safeRequests.filter((request) => request.status !== 'completed' && request.status !== 'cancelled');
  const urgentRecommendations = safeRecommendations.filter((recommendation) => recommendation.severity === 'urgent');

  const quoteColor = pendingQuotes.length > 0 ? '#dc2626' : '#10b981';
  const invoiceAllPaid = outstandingInvoices.length === 0;

  const stats = useMemo(() => [
    {
      title: 'Quotes',
      subtitle: `${pendingQuotes.length} pending · R${(pendingQuotesTotalCents / 100).toFixed(2)}`,
      cta: 'View quotes',
      onClick: () => setOpenModal('quotes'),
      donut: <StatDonut value={pendingQuotes.length} total={safeQuotes.length || 1} color={quoteColor} />,
      className: 'border-black/10'
    },
    {
      title: 'Invoices',
      subtitle: `${outstandingInvoices.length} outstanding · R${(outstandingInvoiceTotalCents / 100).toFixed(2)}`,
      cta: 'View invoices',
      onClick: () => setOpenModal('invoices'),
      donut: <StatDonut value={outstandingInvoices.length} total={safeInvoices.length || 1} color={invoiceAllPaid ? '#16a34a' : '#dc2626'} />,
      className: invoiceAllPaid ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'
    },
    {
      title: 'Requests',
      subtitle: `${openRequests.length} open requests`,
      cta: 'Create request',
      onClick: () => setOpenModal('request'),
      donut: <StatDonut value={openRequests.length} total={safeRequests.length || 1} color="#111827" />,
      className: 'border-black/10'
    },
    {
      title: 'Recommendations',
      subtitle: `${urgentRecommendations.length} urgent · ${safeRecommendations.length} total`,
      cta: 'View recommendations',
      onClick: () => setOpenModal('recommendations'),
      donut: <StatDonut value={urgentRecommendations.length} total={safeRecommendations.length || 1} color="#dc2626" />,
      className: 'border-black/10'
    }
  ], [invoiceAllPaid, openRequests.length, outstandingInvoiceTotalCents, outstandingInvoices.length, pendingQuotes.length, pendingQuotesTotalCents, quoteColor, safeInvoices.length, safeQuotes.length, safeRecommendations.length, safeRequests.length, urgentRecommendations.length]);

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
            ) : <div className="h-24 w-24 rounded-2xl border border-white/20 bg-white/10" />}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-bold tracking-wide">{vehicle.registration_number}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusBadgeClass(vehicle.status)}`}>{vehicle.status ?? 'Pending'}</span>
              </div>
              <p className="text-sm text-white/80">{vehicle.make ?? 'Unknown make'} {vehicle.model ?? 'Unknown model'} {vehicle.year ? `(${vehicle.year})` : ''}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Mileage: {vehicle.odometer_km ? `${vehicle.odometer_km.toLocaleString()} km` : 'N/A'}</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Uploads: {safeAttachments.length}</span>
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
                  <Button variant="ghost" size="sm" className="w-full justify-start text-red-700 hover:bg-red-50" onClick={() => document.getElementById('danger-zone')?.scrollIntoView({ behavior: 'smooth' })}>Remove vehicle</Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className={`space-y-3 p-4 ${stat.className}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">{stat.title}</p>
                <p className="text-sm font-semibold text-brand-black">{stat.subtitle}</p>
              </div>
              {stat.donut}
            </div>
            <Button size="sm" variant="secondary" onClick={stat.onClick}>{stat.cta}</Button>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h3 className="text-lg font-semibold">Quick actions</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button className="justify-start" onClick={() => setOpenModal('request')}>Create request</Button>
          <Button variant="secondary" className="justify-start" onClick={() => setOpenModal('upload')}>Upload actions</Button>
          <Button variant="secondary" className="justify-start" onClick={() => setOpenModal('problem')}>Report issue</Button>
          <Button variant="secondary" className="justify-start" onClick={() => setOpenModal('mileage')}>Update mileage</Button>
        </div>
      </section>

      <details id="danger-zone" className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <summary className="cursor-pointer text-base font-semibold text-red-900">Danger zone</summary>
        <div className="mt-3 space-y-3">
          <RemoveVehicleButton vehicleId={vehicle.id} />
          <Button asChild variant="secondary" size="sm"><Link href={dashboardHref}>Back to dashboard</Link></Button>
        </div>
      </details>

      <Modal open={openModal === 'quotes'} onClose={() => setOpenModal(null)} title="Quotes">
        <div className="space-y-3">
          {safeQuotes.length === 0 ? <p className="text-sm text-gray-600">No quotes available.</p> : null}
          {safeQuotes.map((quote) => <div key={quote.id} className="rounded-xl border p-3 text-sm"><p>{quote.status ?? 'unknown'} · R{(quote.total_cents / 100).toFixed(2)}</p><QuoteDecisionButtons quoteId={quote.id} /></div>)}
        </div>
      </Modal>
      <Modal open={openModal === 'invoices'} onClose={() => setOpenModal(null)} title="Invoices">
        <div className="space-y-3">
          {safeInvoices.length === 0 ? <p className="text-sm text-gray-600">No invoices available.</p> : null}
          {safeInvoices.map((invoice) => <div key={invoice.id} className="rounded-xl border p-3 text-sm"><p>{invoice.status ?? 'unknown'} / {invoice.payment_status ?? 'unknown'}</p><p>R{(invoice.total_cents / 100).toFixed(2)} · due {invoice.due_date ?? 'n/a'}</p><Button asChild size="sm" variant="outline" className="mt-2"><Link href={documentsHref}>Download</Link></Button></div>)}
        </div>
      </Modal>
      <Modal open={openModal === 'requests'} onClose={() => setOpenModal(null)} title="Requests">
        <div className="space-y-2">{safeRequests.map((request) => <p key={request.id} className="rounded-xl border p-3 text-sm">{request.request_type ?? 'request'} · {request.status ?? 'unknown'}</p>)}</div>
      </Modal>
      <Modal open={openModal === 'recommendations'} onClose={() => setOpenModal(null)} title="Recommendations">
        <div className="space-y-3">
          {safeRecommendations.length === 0 ? <p className="text-sm text-gray-600">No recommendations available.</p> : null}
          {safeRecommendations.map((recommendation) => <div key={recommendation.id} className="rounded-xl border p-3 text-sm"><p>{recommendation.title ?? 'Recommendation'} · {recommendation.status ?? recommendation.status_text ?? 'open'} · {recommendation.severity ?? 'n/a'}</p>{recommendation.description ? <p className="text-xs text-gray-600">{recommendation.description}</p> : null}<RecommendationDecisionButtons recommendationId={recommendation.id} /></div>)}
        </div>
      </Modal>
      <Modal open={openModal === 'request'} onClose={() => setOpenModal(null)} title="Create request"><RequestForm vehicleId={vehicle.id} /></Modal>
      <Modal open={openModal === 'problem'} onClose={() => setOpenModal(null)} title="Report a problem"><ReportIssueForm vehicleId={vehicle.id} /></Modal>
      <Modal open={openModal === 'mileage'} onClose={() => setOpenModal(null)} title="Update mileage"><MileageForm vehicleId={vehicle.id} /></Modal>
      <Modal open={openModal === 'upload'} onClose={() => setOpenModal(null)} title="Upload actions"><CustomerUploadActions vehicleId={vehicle.id} /></Modal>
    </div>
  );
}

export function CustomerVehicleDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-44 animate-pulse rounded-2xl bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}</div>
      <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  );
}
