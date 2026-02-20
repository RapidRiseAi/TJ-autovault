export type TimelineEventItem = {
  id: string;
  created_at: string | null;
  title: string;
  description: string | null;
  importance: string | null;
  actorLabel: string;
  event_type: string;
  metadata?: Record<string, unknown> | null;
};

export type DocumentItem = {
  id: string;
  created_at: string | null;
  original_name: string | null;
  subject: string | null;
  document_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  importance: string | null;
  invoice_id?: string | null;
};

export type ActivityItem = {
  id: string;
  kind: 'timeline' | 'document';
  targetId: string;
  category: 'requests' | 'quotes' | 'invoices' | 'uploads' | 'recommendations' | 'system';
  createdAt: string | null;
  title: string;
  description: string | null;
  importance: string | null;
  actorLabel: string;
  subtitle: string;
  downloadHref?: string;
};

function labelDocumentType(type?: string | null) {
  return (type ?? 'other').replaceAll('_', ' ');
}

function mapCategory(eventType?: string | null): ActivityItem['category'] {
  const value = (eventType ?? '').toLowerCase();
  if (value.includes('request')) return 'requests';
  if (value.includes('quote')) return 'quotes';
  if (value.includes('invoice')) return 'invoices';
  if (value.includes('doc') || value.includes('upload')) return 'uploads';
  if (value.includes('recommend')) return 'recommendations';
  return 'system';
}

function toDownloadHref(doc?: DocumentItem) {
  if (!doc?.storage_path) return undefined;
  return `/api/uploads/download?bucket=${encodeURIComponent(doc.storage_bucket ?? '')}&path=${encodeURIComponent(doc.storage_path)}`;
}

export function buildActivityStream(timelineRows: TimelineEventItem[], docs: DocumentItem[]): ActivityItem[] {
  const docIds = new Set(docs.map((doc) => doc.id));
  const docsByInvoiceId = new Map<string, DocumentItem>();

  docs.forEach((doc) => {
    if (doc.invoice_id) docsByInvoiceId.set(doc.invoice_id, doc);
  });

  const timelineItems: ActivityItem[] = timelineRows.map((event) => {
    const category = mapCategory(event.event_type);
    const invoiceId = typeof event.metadata?.invoice_id === 'string' ? event.metadata.invoice_id : undefined;

    return {
      id: event.id,
      kind: 'timeline',
      targetId: event.id,
      category,
      createdAt: event.created_at,
      title: event.title,
      subtitle: event.event_type.replaceAll('_', ' '),
      description: event.description,
      importance: event.importance,
      actorLabel: event.actorLabel,
      downloadHref: category === 'invoices' && invoiceId ? toDownloadHref(docsByInvoiceId.get(invoiceId)) : undefined
    };
  });

  const docItems: ActivityItem[] = docs.map((doc) => ({
    id: `doc-${doc.id}`,
    kind: 'document',
    targetId: doc.id,
    category: doc.document_type === 'invoice' ? 'invoices' : 'uploads',
    createdAt: doc.created_at,
    title: doc.subject ?? doc.original_name ?? 'Document uploaded',
    subtitle: `Uploaded ${labelDocumentType(doc.document_type)}`,
    description: doc.original_name,
    importance: doc.importance,
    actorLabel: 'Document upload',
    downloadHref: toDownloadHref(doc)
  }));

  const filteredTimelineItems = timelineItems.filter((item) => {
    const event = timelineRows.find((row) => row.id === item.id);
    if (!event || event.event_type !== 'doc_uploaded') return true;
    const metadataDocId = typeof event.metadata?.doc_id === 'string' ? event.metadata.doc_id : null;
    return !metadataDocId || !docIds.has(metadataDocId);
  });

  return [...filteredTimelineItems, ...docItems].sort((a, b) => {
    const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return right - left;
  });
}
