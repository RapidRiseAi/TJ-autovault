'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { importanceBadgeClass } from '@/lib/timeline';

type VehicleDocument = {
  id: string;
  created_at: string | null;
  document_type: string | null;
  original_name: string | null;
  subject: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  importance: string | null;
};

type DocumentGroups = {
  quotes: VehicleDocument[];
  invoices: VehicleDocument[];
  inspectionReports: VehicleDocument[];
  photos: VehicleDocument[];
  other: VehicleDocument[];
};

function toLabel(type?: string | null) {
  return (type ?? 'other').replaceAll('_', ' ');
}

function toDownloadHref(doc: VehicleDocument) {
  if (!doc.storage_path) return null;
  return `/api/uploads/download?bucket=${encodeURIComponent(doc.storage_bucket ?? '')}&path=${encodeURIComponent(doc.storage_path)}`;
}

export function groupVehicleDocuments(documents: VehicleDocument[]): DocumentGroups {
  return documents.reduce<DocumentGroups>(
    (groups, doc) => {
      if (doc.document_type === 'quote') groups.quotes.push(doc);
      else if (doc.document_type === 'invoice') groups.invoices.push(doc);
      else if (doc.document_type === 'inspection') groups.inspectionReports.push(doc);
      else if (doc.document_type === 'before_images' || doc.document_type === 'after_images' || doc.document_type === 'vehicle_photo') groups.photos.push(doc);
      else groups.other.push(doc);
      return groups;
    },
    { quotes: [], invoices: [], inspectionReports: [], photos: [], other: [] }
  );
}

function DocumentList({ documents }: { documents: VehicleDocument[] }) {
  if (documents.length === 0) return <p className="rounded border border-dashed p-3 text-sm text-gray-600">No documents yet.</p>;

  return (
    <ul className="space-y-2">
      {documents.map((doc) => {
        const fallbackName = doc.storage_path?.split('/').at(-1) ?? 'Untitled file';
        const title = doc.subject ?? doc.original_name ?? fallbackName;
        const downloadHref = toDownloadHref(doc);

        return (
          <li key={doc.id} className="rounded border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold">{title}</h4>
                  <span className="rounded border bg-gray-50 px-2 py-0.5 text-[10px] uppercase">{toLabel(doc.document_type)}</span>
                  <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${importanceBadgeClass(doc.importance)}`}>{doc.importance ?? 'info'}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{doc.created_at ? new Date(doc.created_at).toLocaleString() : 'Unknown date'}</p>
              </div>
              <div className="flex gap-2">
                {downloadHref ? (
                  <>
                    <Button asChild size="sm" variant="outline"><Link href={downloadHref}>Preview</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link href={downloadHref} download>Download</Link></Button>
                  </>
                ) : <span className="text-xs text-gray-500">Unavailable</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function VehicleDocumentsGroups({ groups }: { groups: DocumentGroups }) {
  const sections = useMemo(() => [
    { key: 'quotes', title: 'Quotes', items: groups.quotes },
    { key: 'invoices', title: 'Invoices', items: groups.invoices },
    { key: 'reports', title: 'Reports', items: groups.inspectionReports },
    { key: 'photos', title: 'Photos', items: groups.photos },
    { key: 'other', title: 'Other', items: groups.other }
  ], [groups]);

  const [activeTab, setActiveTab] = useState(sections[0]?.key ?? 'quotes');
  const activeSection = sections.find((section) => section.key === activeTab) ?? sections[0];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2 border-b pb-3">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveTab(section.key)}
            className={`rounded-t-xl border px-4 py-2 text-sm font-medium ${activeTab === section.key ? 'border-black bg-black text-white' : 'border-black/10 bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
          >
            {section.title} ({section.items.length})
          </button>
        ))}
      </div>
      <DocumentList documents={activeSection?.items ?? []} />
    </Card>
  );
}

export function DocumentsSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded border bg-gray-100" />)}</div>;
}
