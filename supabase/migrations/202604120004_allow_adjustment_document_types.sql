alter table if exists public.vehicle_documents
  drop constraint if exists vehicle_documents_document_type_check;

alter table if exists public.vehicle_documents
  add constraint vehicle_documents_document_type_check
  check (
    document_type in (
      'before_images',
      'after_images',
      'inspection',
      'quote',
      'invoice',
      'parts_list',
      'warranty',
      'report',
      'credit_note',
      'debit_note',
      'other'
    )
  );
