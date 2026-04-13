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
  quote_id?: string | null;
};

export type ActivityItem = {
  id: string;
  kind: 'timeline' | 'document';
  targetId: string;
  category:
    | 'requests'
    | 'quotes'
    | 'invoices'
    | 'credit_notes'
    | 'uploads'
    | 'recommendations'
    | 'system';
  createdAt: string | null;
  title: string;
  description: string | null;
  importance: string | null;
  actorLabel: string;
  actorType: 'workshop' | 'technician' | 'customer' | 'system';
  subtitle: string;
  downloadHref?: string;
  actionHref?: string;
  actionLabel?: string;
  quoteId?: string;
  invoiceId?: string;
  vehicleId?: string;
  documentId?: string;
  referenceNumber?: string;
};

function parseReferenceNumber(value: string | null | undefined) {
  if (!value) return undefined;
  const match = value.match(/\b((?:INV|CN|DN|QUO)-[A-Z0-9-]{3,})\b/i);
  return match?.[1]?.toUpperCase();
}

function labelDocumentType(type?: string | null) {
  return (type ?? 'other').replaceAll('_', ' ');
}

function mapActorType(label: string): ActivityItem['actorType'] {
  if (label.startsWith('workshop/')) return 'workshop';
  if (label.startsWith('technician/')) return 'technician';
  if (label.startsWith('customer/')) return 'customer';
  return 'system';
}

function mapCategory(
  eventType?: string | null,
  metadata?: Record<string, unknown> | null
): ActivityItem['category'] {
  const value = (eventType ?? '').toLowerCase();
  const metadataDocType =
    typeof metadata?.document_type === 'string'
      ? metadata.document_type.toLowerCase()
      : '';
  const metadataDocTypeAlt =
    typeof metadata?.doc_type === 'string'
      ? metadata.doc_type.toLowerCase()
      : '';
  const docType = metadataDocType || metadataDocTypeAlt;
  if (value.includes('job')) return 'system';
  if (value.includes('request')) return 'requests';
  if (value.includes('quote') || docType === 'quote') return 'quotes';
  if (
    value.includes('credit_note') ||
    value.includes('credit note') ||
    docType === 'credit_note' ||
    docType === 'debit_note'
  )
    return 'credit_notes';
  if (value.includes('invoice') || docType === 'invoice') return 'invoices';
  if (value.includes('doc') || value.includes('upload')) return 'uploads';
  if (value.includes('recommend')) return 'recommendations';
  return 'system';
}

function toDownloadHref(doc?: DocumentItem) {
  if (!doc?.storage_path) return undefined;
  return `/api/uploads/download?bucket=${encodeURIComponent(doc.storage_bucket ?? '')}&path=${encodeURIComponent(doc.storage_path)}`;
}

function attachmentDownloadHref(metadata?: Record<string, unknown> | null) {
  const attachment = metadata?.attachment;
  const attachmentBucket =
    typeof (attachment as Record<string, unknown> | undefined)?.bucket ===
    'string'
      ? (attachment as Record<string, string>).bucket
      : null;
  const attachmentPath =
    typeof (attachment as Record<string, unknown> | undefined)?.path ===
    'string'
      ? (attachment as Record<string, string>).path
      : null;

  if (!attachmentBucket || !attachmentPath) return undefined;
  return `/api/uploads/download?bucket=${encodeURIComponent(attachmentBucket)}&path=${encodeURIComponent(attachmentPath)}`;
}

export function buildActivityStream(
  timelineRows: TimelineEventItem[],
  docs: DocumentItem[]
): ActivityItem[] {
  const docIds = new Set(docs.map((doc) => doc.id));
  const docsByInvoiceId = new Map<string, DocumentItem>();

  docs.forEach((doc) => {
    if (doc.invoice_id) docsByInvoiceId.set(doc.invoice_id, doc);
  });

  const timelineItems: ActivityItem[] = timelineRows.map((event) => {
    const category = mapCategory(event.event_type, event.metadata);
    const invoiceId =
      typeof event.metadata?.invoice_id === 'string'
        ? event.metadata.invoice_id
        : undefined;
    const quoteId =
      typeof event.metadata?.quote_id === 'string'
        ? event.metadata.quote_id
        : undefined;
    const jobCardId =
      typeof event.metadata?.job_card_id === 'string'
        ? event.metadata.job_card_id
        : undefined;
    const jobStatus =
      typeof event.metadata?.job_status === 'string'
        ? event.metadata.job_status.replaceAll('_', ' ')
        : null;
    const subtitle =
      event.event_type === 'job_card_snapshot'
        ? `Job card snapshot${jobStatus ? ` · ${jobStatus}` : ''}`
        : event.event_type.replaceAll('_', ' ');
    const documentId =
      typeof event.metadata?.document_id === 'string'
        ? event.metadata.document_id
        : typeof event.metadata?.doc_id === 'string'
          ? event.metadata.doc_id
          : undefined;
    const referenceNumber =
      (typeof event.metadata?.invoice_number === 'string'
        ? event.metadata.invoice_number
        : undefined) ??
      (typeof event.metadata?.reference_number === 'string'
        ? event.metadata.reference_number
        : undefined) ??
      parseReferenceNumber(event.title) ??
      parseReferenceNumber(event.description) ??
      undefined;

    return {
      id: event.id,
      kind: 'timeline',
      targetId: event.id,
      category,
      createdAt: event.created_at,
      title: event.title,
      subtitle,
      description: event.description,
      importance: event.importance,
      actorLabel: event.actorLabel,
      actorType: mapActorType(event.actorLabel),
      downloadHref:
        attachmentDownloadHref(event.metadata) ??
        (category === 'invoices' && invoiceId
          ? toDownloadHref(docsByInvoiceId.get(invoiceId))
          : undefined),
      actionHref: jobCardId ? `/customer/jobs/${jobCardId}` : undefined,
      actionLabel: jobCardId ? 'View job' : undefined,
      quoteId,
      invoiceId,
      vehicleId:
        typeof event.metadata?.vehicle_id === 'string'
          ? event.metadata.vehicle_id
          : undefined,
      documentId,
      referenceNumber
    };
  });

  const docItems: ActivityItem[] = docs.map((doc) => ({
    id: `doc-${doc.id}`,
    kind: 'document',
    targetId: doc.id,
    category:
      doc.document_type === 'invoice'
        ? 'invoices'
        : doc.document_type === 'quote'
          ? 'quotes'
          : doc.document_type === 'credit_note' ||
              doc.document_type === 'debit_note'
            ? 'credit_notes'
            : 'uploads',
    createdAt: doc.created_at,
    title: doc.subject ?? doc.original_name ?? 'Document uploaded',
    subtitle: `Uploaded ${labelDocumentType(doc.document_type)}`,
    description: doc.original_name,
    importance: doc.importance,
    actorLabel: 'Document upload',
    actorType: 'system',
    downloadHref: toDownloadHref(doc),
    quoteId: doc.quote_id ?? undefined,
    invoiceId: doc.invoice_id ?? undefined,
    documentId: doc.id,
    referenceNumber:
      parseReferenceNumber(doc.subject) ??
      parseReferenceNumber(doc.original_name)
  }));

  const filteredTimelineItems = timelineItems.filter((item) => {
    const eventRow = timelineRows.find((row) => row.id === item.id);
    if (!eventRow || eventRow.event_type !== 'doc_uploaded') return true;
    const metadataDocId =
      typeof eventRow.metadata?.doc_id === 'string'
        ? eventRow.metadata.doc_id
        : null;
    return !metadataDocId || !docIds.has(metadataDocId);
  });

  // Consolidate document-linked created/uploaded duplicates (quotes, invoices, notes, uploads)
  // so one row carries the actions/labels, regardless of which source produced the event.
  const documentLinkedGroups = new Map<string, ActivityItem[]>();
  const maybeInvoiceCandidates: ActivityItem[] = [];
  for (const item of [...filteredTimelineItems, ...docItems]) {
    const documentId = item.documentId;
    const looksLikeCreationOrUpload =
      item.kind === 'document' || /created|uploaded/i.test(item.subtitle);
    if (!documentId || !looksLikeCreationOrUpload) {
      maybeInvoiceCandidates.push(item);
      continue;
    }
    const existing = documentLinkedGroups.get(documentId) ?? [];
    existing.push(item);
    documentLinkedGroups.set(documentId, existing);
  }

  const mergeItems = (items: ActivityItem[]) => {
    const ranked = [...items].sort((a, b) => {
      const score = (item: ActivityItem) =>
        (item.downloadHref ? 10 : 0) +
        (/inv-\d+/i.test(item.title) ? 6 : 0) +
        (item.kind === 'timeline' ? 3 : 0) +
        (item.description ? 1 : 0);
      return score(b) - score(a);
    });
    const preferred = ranked[0];
    const newest = [...items].sort((a, b) => {
      const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return right - left;
    })[0];

    return {
      ...preferred,
      createdAt: newest.createdAt,
      subtitle: preferred.subtitle || newest.subtitle,
      description:
        preferred.description ||
        items.find((item) => item.description)?.description ||
        null,
      downloadHref:
        preferred.downloadHref ||
        items.find((item) => item.downloadHref)?.downloadHref,
      actionHref:
        preferred.actionHref ||
        items.find((item) => item.actionHref)?.actionHref,
      actionLabel:
        preferred.actionLabel ||
        items.find((item) => item.actionLabel)?.actionLabel
    } satisfies ActivityItem;
  };

  // Consolidate invoice "created/uploaded" duplicates so one row carries all useful
  // context (invoice ref/title + preview/download) instead of rendering near-identical
  // entries from timeline + document sources.
  const invoiceGroups = new Map<string, ActivityItem[]>();
  const nonGrouped: ActivityItem[] = [];
  for (const item of maybeInvoiceCandidates) {
    const invoiceKey = item.invoiceId || item.referenceNumber;
    const looksLikeCreationOrUpload =
      item.category === 'invoices' &&
      (item.kind === 'document' ||
        /created|uploaded/i.test(item.subtitle) ||
        /inv-\d+/i.test(item.title));
    if (!invoiceKey || !looksLikeCreationOrUpload) {
      nonGrouped.push(item);
      continue;
    }
    const existing = invoiceGroups.get(invoiceKey) ?? [];
    existing.push(item);
    invoiceGroups.set(invoiceKey, existing);
  }

  const mergedDocumentLinkedItems = Array.from(
    documentLinkedGroups.values()
  ).map(mergeItems);
  const mergedInvoiceItems = Array.from(invoiceGroups.values()).map(mergeItems);

  return [
    ...nonGrouped,
    ...mergedDocumentLinkedItems,
    ...mergedInvoiceItems
  ].sort((a, b) => {
    const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return right - left;
  });
}
