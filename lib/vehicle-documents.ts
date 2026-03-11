export type VehicleDocument = {
  id: string;
  created_at: string | null;
  document_type: string | null;
  original_name: string | null;
  subject: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  importance: string | null;
};

export type VehicleDocumentsGroups = {
  quotes: VehicleDocument[];
  invoices: VehicleDocument[];
  inspectionReports: VehicleDocument[];
  photos: VehicleDocument[];
  other: VehicleDocument[];
};

export function groupVehicleDocuments(documents: VehicleDocument[]): VehicleDocumentsGroups {
  return documents.reduce<VehicleDocumentsGroups>(
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
