'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RequestForm, MileageForm, QuoteDecisionButtons, RecommendationDecisionButtons } from '@/components/customer/vehicle-actions';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { UploadsSection } from '@/components/customer/uploads-section';
import { RemoveVehicleButton } from '@/components/customer/remove-vehicle-button';
import { CustomerUploadActions } from '@/components/customer/customer-upload-actions';
import { MiniTimeline } from '@/components/customer/mini-timeline';
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
  quotes: Array<{ id: string; status: string | null; total_cents: number }>;
  invoices: Array<{ id: string; status: string | null; payment_status: string | null; total_cents: number; due_date: string | null }>;
  requests: Array<{ id: string; request_type: string | null; status: string | null }>;
  recommendations: Array<{ id: string; title: string | null; description: string | null; severity: string | null; status: string | null; status_text: string | null }>;
  attachments: Array<{ id: string; bucket: string | null; storage_path: string | null; original_name: string | null; created_at: string | null; document_type: string | null; subject: string | null; importance: string | null }>;
  timelineHref: string;
  documentsHref: string;
  editHref: string;
  dashboardHref: string;
}) {
  const [openModal, setOpenModal] = useState<'request' | 'problem' | 'mileage' | 'upload' | null>(null);
  const timelineItems = Array.isArray(timeline) ? timeline.slice(0, 5) : [];
  const lastActivity = timelineItems[0]?.createdAt ?? null;
  const startActivity = timeline.at(-1)?.createdAt ?? null;

  const quotePreview = Array.isArray(quotes) ? quotes.slice(0, 3) : [];
  const invoicePreview = Array.isArray(invoices) ? invoices.slice(0, 3) : [];
  const requestPreview = Array.isArray(requests) ? requests.slice(0, 3) : [];
  const recommendationPreview = Array.isArray(recommendations) ? recommendations.slice(0, 3) : [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            {vehicle.primary_image_path ? (
              <img
                src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                alt="Vehicle"
                className="h-20 w-20 rounded-xl object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-gray-100" />
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold">{vehicle.registration_number}</h2>
                <span className="rounded-full border border-black/15 px-2 py-1 text-xs uppercase">{vehicle.status ?? 'pending'}</span>
              </div>
              <p className="text-sm text-gray-600">{vehicle.make ?? 'Unknown make'} {vehicle.model ?? 'Unknown model'} {vehicle.year ? `(${vehicle.year})` : ''}</p>
              <div className="grid gap-1 text-xs text-gray-600 sm:grid-cols-3 sm:gap-4">
                <p>Timeline start: {startActivity ? new Date(startActivity).toLocaleDateString() : 'N/A'}</p>
                <p>Last activity: {lastActivity ? new Date(lastActivity).toLocaleDateString() : 'N/A'}</p>
                <p>Total events: {timeline.length}</p>
              </div>
              <details className="rounded-lg border border-black/10 p-3">
                <summary className="cursor-pointer text-sm font-medium">More details</summary>
                <div className="mt-2 grid gap-1 text-xs text-gray-600">
                  <p>Odometer: {vehicle.odometer_km ?? 'N/A'} km</p>
                  <p>Next service km: {vehicle.next_service_km ?? 'N/A'} km</p>
                  <p>Next service date: {vehicle.next_service_date ?? 'N/A'}</p>
                </div>
              </details>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm"><Link href={timelineHref}>View timeline</Link></Button>
            <Button asChild variant="secondary" size="sm"><Link href={documentsHref}>View documents</Link></Button>
            <details className="relative">
              <summary className="list-none"><span className="inline-flex cursor-pointer items-center rounded-lg border border-black/15 px-3 py-2 text-xs font-medium hover:bg-gray-100">More</span></summary>
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border bg-white p-1 shadow-lg">
                <Button asChild variant="ghost" size="sm" className="w-full justify-start"><Link href={editHref}>Edit vehicle</Link></Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpenModal('upload')}>Update photo</Button>
                <Button variant="ghost" size="sm" className="w-full justify-start text-red-700 hover:bg-red-50" onClick={() => document.getElementById('danger-zone')?.scrollIntoView({ behavior: 'smooth' })}>Remove vehicle</Button>
              </div>
            </details>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-lg font-semibold">Recent activity</h3>
        <MiniTimeline
          items={timelineItems}
          startDate={startActivity ? new Date(startActivity).toLocaleDateString() : 'N/A'}
          lastUpdated={lastActivity ? new Date(lastActivity).toLocaleDateString() : 'N/A'}
          timelineHref={timelineHref}
        />
      </Card>

      <Card className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpenModal('request')}>Create request</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpenModal('problem')}>Report problem</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpenModal('mileage')}>Update mileage</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpenModal('upload')}>Upload actions</Button>
        </div>
      </Card>

      <details className="rounded-2xl border border-black/10 bg-white p-4" open>
        <summary className="cursor-pointer text-base font-semibold">Quotes ({quotes.length})</summary>
        <p className="mt-1 text-xs text-gray-600">Pending decisions and latest quote values</p>
        <div className="mt-3 space-y-2">
          {quotePreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No quotes available.</p> : null}
          {quotePreview.map((q) => (
            <div key={q.id} className="rounded-lg border p-3 text-sm">
              <p>{q.status ?? 'unknown'} · R{(q.total_cents / 100).toFixed(2)}</p>
              <QuoteDecisionButtons quoteId={q.id} />
            </div>
          ))}
          {quotes.length > 3 ? <p className="text-xs text-gray-500">Showing latest 3 of {quotes.length} quotes.</p> : null}
        </div>
      </details>

      <details className="rounded-2xl border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold">Invoices ({invoices.length})</summary>
        <p className="mt-1 text-xs text-gray-600">Recent invoices and payment statuses</p>
        <div className="mt-3 space-y-2 text-sm">
          {invoicePreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No invoices available.</p> : null}
          {invoicePreview.map((invoice) => <p key={invoice.id} className="rounded-lg border p-3">{invoice.status ?? 'unknown'}/{invoice.payment_status ?? 'unknown'} · R{(invoice.total_cents / 100).toFixed(2)} · due {invoice.due_date ?? 'n/a'}</p>)}
          <Button asChild size="sm" variant="secondary"><Link href={documentsHref}>Manage invoices</Link></Button>
        </div>
      </details>

      <details className="rounded-2xl border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold">Requests ({requests.length})</summary>
        <p className="mt-1 text-xs text-gray-600">Latest service/inspection requests</p>
        <div className="mt-3 space-y-2 text-sm">
          {requestPreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No requests available.</p> : null}
          {requestPreview.map((request) => <p key={request.id} className="rounded-lg border p-3">{request.request_type ?? 'request'} · {request.status ?? 'unknown'}</p>)}
          <Button size="sm" onClick={() => setOpenModal('request')}>Manage requests</Button>
        </div>
      </details>

      <details className="rounded-2xl border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold">Recommendations ({recommendations.length})</summary>
        <p className="mt-1 text-xs text-gray-600">Top workshop recommendations needing action</p>
        <div className="mt-3 space-y-2">
          {recommendationPreview.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-gray-600">No recommendations available.</p> : null}
          {recommendationPreview.map((rec) => (
            <div key={rec.id} className="rounded-lg border p-3 text-sm">
              <p>{rec.title ?? 'Recommendation'} · {rec.status ?? rec.status_text ?? 'open'} · {rec.severity ?? 'n/a'}</p>
              {rec.description ? <p className="text-xs text-gray-600">{rec.description}</p> : null}
              <RecommendationDecisionButtons recommendationId={rec.id} />
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-2xl border border-black/10 bg-white p-4">
        <summary className="cursor-pointer text-base font-semibold">Uploads ({attachments.length})</summary>
        <p className="mt-1 text-xs text-gray-600">Latest files and report uploads</p>
        <div className="mt-3 space-y-3">
          <UploadsSection vehicleId={vehicle.id} attachments={attachments} />
          <Button size="sm" variant="secondary" onClick={() => setOpenModal('upload')}>Manage uploads</Button>
        </div>
      </details>

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
