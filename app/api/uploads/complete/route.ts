import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  vehicleId: z.string().uuid(),
  bucket: z.enum(['vehicle-images', 'vehicle-files']),
  path: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  originalName: z.string().min(1),
  docType: z.enum([
    'vehicle_photo',
    'before_images',
    'after_images',
    'before_photos',
    'after_photos',
    'inspection',
    'inspection_report',
    'quote',
    'invoice',
    'parts_list',
    'warranty',
    'warning',
    'report',
    'other'
  ]),
  subject: z.string().trim().optional(),
  body: z.string().trim().optional(),
  importance: z.enum(['info', 'warning', 'urgent']).optional(),
  urgency: z.enum(['info', 'low', 'medium', 'high', 'critical']).default('info'),
  amountCents: z.number().int().nonnegative().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function canonicalDocType(docType: z.infer<typeof requestSchema>['docType']) {
  if (docType === 'before_photos') return 'before_images';
  if (docType === 'after_photos') return 'after_images';
  if (docType === 'inspection_report') return 'inspection';
  if (docType === 'warning') return 'report';
  return docType;
}

function urgencyToImportance(urgency: z.infer<typeof requestSchema>['urgency']) {
  if (urgency === 'high' || urgency === 'critical') return 'urgent';
  if (urgency === 'low' || urgency === 'medium') return 'warning';
  return 'info';
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });

  const payload = parsed.data;
  const normalizedDocType = canonicalDocType(payload.docType);
  const warningUpload = payload.docType === 'warning';
  const normalizedImportance = warningUpload ? (payload.importance === 'urgent' ? 'urgent' : 'warning') : payload.importance ?? urgencyToImportance(payload.urgency);

  if (warningUpload && (!payload.subject?.trim() || !payload.body?.trim())) {
    return NextResponse.json({ error: 'Warning uploads require both subject and body.' }, { status: 400 });
  }

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,workshop_account_id,current_customer_account_id')
    .eq('id', payload.vehicleId)
    .maybeSingle();
  if (!vehicle?.current_customer_account_id) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const [{ data: customerMembership }, { data: workshopMembership }, { data: profile }, { data: customerAccount }] = await Promise.all([
    supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).eq('id', vehicle.current_customer_account_id).maybeSingle(),
    supabase.from('profiles').select('id,role').eq('id', user.id).eq('workshop_account_id', vehicle.workshop_account_id).in('role', ['admin', 'technician']).maybeSingle(),
    supabase.from('profiles').select('id,role,display_name').eq('id', user.id).maybeSingle(),
    supabase.from('customer_accounts').select('name').eq('id', vehicle.current_customer_account_id).maybeSingle()
  ]);

  if (!customerMembership && !workshopMembership) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const actorRole = workshopMembership ? 'admin' : 'customer';
  if (actorRole === 'customer' && (normalizedDocType === 'quote' || normalizedDocType === 'invoice')) {
    return NextResponse.json({ error: 'Customers cannot upload quote/invoice documents' }, { status: 403 });
  }

  const docInsert = {
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: payload.vehicleId,
    doc_type: normalizedDocType,
    document_type: normalizedDocType === 'vehicle_photo' ? 'other' : normalizedDocType,
    storage_bucket: payload.bucket,
    storage_path: payload.path,
    original_name: payload.originalName,
    mime_type: payload.contentType,
    size_bytes: payload.size,
    subject: payload.subject || null,
    body: payload.body || null,
    importance: normalizedImportance
  };

  const { data: doc, error } = await supabase.from('vehicle_documents').insert(docInsert).select('id').single();
  if (error || !doc) return NextResponse.json({ error: error?.message ?? 'Could not save upload metadata' }, { status: 400 });

  if (normalizedDocType === 'vehicle_photo') {
    await supabase.from('vehicles').update({ primary_image_path: payload.path, vehicle_image_doc_id: doc.id }).eq('id', payload.vehicleId);
    await supabase.from('vehicle_timeline_events').insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: payload.vehicleId,
      actor_profile_id: profile?.id ?? user.id,
      actor_role: actorRole,
      event_type: 'doc_uploaded',
      title: 'Vehicle photo updated',
      description: payload.body || null,
      importance: normalizedImportance,
      metadata: { doc_id: doc.id, type: 'vehicle_photo', urgency: payload.urgency }
    });
    return NextResponse.json({ ok: true, documentId: doc.id });
  }

  let linkedEntityId: string | null = null;

  if (normalizedDocType === 'quote') {
    if (!payload.amountCents || !payload.subject) return NextResponse.json({ error: 'Quote amount and subject are required' }, { status: 400 });
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        workshop_account_id: vehicle.workshop_account_id,
        customer_account_id: vehicle.current_customer_account_id,
        vehicle_id: payload.vehicleId,
        total_cents: payload.amountCents,
        subtotal_cents: payload.amountCents,
        notes: payload.body || null,
        status: 'sent',
        document_id: doc.id
      })
      .select('id')
      .single();
    if (quoteError || !quote) return NextResponse.json({ error: quoteError?.message ?? 'Could not create quote' }, { status: 400 });
    linkedEntityId = quote.id;
    await supabase.from('vehicle_documents').update({ quote_id: quote.id }).eq('id', doc.id);
  } else if (normalizedDocType === 'invoice') {
    if (!payload.amountCents || !payload.subject) return NextResponse.json({ error: 'Invoice amount and subject are required' }, { status: 400 });
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        workshop_account_id: vehicle.workshop_account_id,
        customer_account_id: vehicle.current_customer_account_id,
        vehicle_id: payload.vehicleId,
        total_cents: payload.amountCents,
        status: 'sent',
        payment_status: 'unpaid',
        due_date: payload.dueDate || null,
        subject: payload.subject,
        notes: payload.body || null,
        document_id: doc.id
      })
      .select('id')
      .single();
    if (invoiceError || !invoice) return NextResponse.json({ error: invoiceError?.message ?? 'Could not create invoice' }, { status: 400 });
    linkedEntityId = invoice.id;
    await supabase.from('vehicle_documents').update({ invoice_id: invoice.id }).eq('id', doc.id);
  }

  const eventType = normalizedDocType === 'quote' ? 'quote_created' : normalizedDocType === 'invoice' ? 'invoice_created' : 'doc_uploaded';
  const title = payload.subject || `Uploaded ${normalizedDocType.replace('_', ' ')}`;

  const notificationData = {
    vehicle_id: payload.vehicleId,
    vehicle_registration: vehicle.registration_number,
    customer_account_id: vehicle.current_customer_account_id,
    customer_name: customerAccount?.name ?? null,
    uploaded_by: profile?.display_name ?? profile?.id ?? null,
    document_id: doc.id,
    document_type: normalizedDocType,
    linked_entity_id: linkedEntityId
  };

  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: payload.vehicleId,
    actor_profile_id: profile?.id ?? user.id,
    actor_role: actorRole,
    event_type: eventType,
    title,
    description: payload.body || null,
    importance: normalizedImportance,
    metadata: { doc_id: doc.id, type: normalizedDocType, linked_entity_id: linkedEntityId, urgency: payload.urgency }
  });

  const shouldNotifyCustomer = actorRole === 'admin' && (['quote', 'invoice', 'inspection', 'report'].includes(normalizedDocType) || normalizedImportance !== 'info');
  const shouldNotifyWorkshop = actorRole === 'customer' && normalizedDocType === 'report';

  if (shouldNotifyCustomer) {
    await supabase.from('notifications').insert({
      workshop_account_id: vehicle.workshop_account_id,
      to_customer_account_id: vehicle.current_customer_account_id,
      kind: normalizedDocType === 'invoice' ? 'invoice' : normalizedDocType === 'quote' ? 'quote' : 'report',
      title: payload.subject || `New ${normalizedDocType.replace('_', ' ')}`,
      body: payload.body || 'A document was uploaded for your vehicle.',
      href: `/customer/vehicles/${payload.vehicleId}`,
      data: notificationData
    });
  }

  if (shouldNotifyWorkshop) {
    await supabase.rpc('push_notification_to_workshop', {
      p_workshop_account_id: vehicle.workshop_account_id,
      p_kind: 'report',
      p_title: payload.subject || 'Customer report uploaded',
      p_body: payload.body || 'A customer uploaded a report document.',
      p_href: `/workshop/vehicles/${payload.vehicleId}`,
      p_data: notificationData
    });
  }

  return NextResponse.json({ ok: true, documentId: doc.id });
}
