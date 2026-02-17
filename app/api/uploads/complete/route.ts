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
  docType: z.enum(['vehicle_photo', 'before_images', 'after_images', 'inspection', 'quote', 'invoice', 'parts_list', 'warranty', 'report', 'other']),
  subject: z.string().trim().optional(),
  body: z.string().trim().optional(),
  importance: z.enum(['info', 'warning', 'urgent']).default('info'),
  amountCents: z.number().int().nonnegative().optional()
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  const payload = parsed.data;

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vehicle } = await supabase.from('vehicles').select('id,workshop_account_id,current_customer_account_id').eq('id', payload.vehicleId).single();
  if (!vehicle?.current_customer_account_id) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const [{ data: customerMembership }, { data: workshopMembership }, { data: profile }] = await Promise.all([
    supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).eq('id', vehicle.current_customer_account_id).maybeSingle(),
    supabase.from('profiles').select('id,role').eq('id', user.id).eq('workshop_account_id', vehicle.workshop_account_id).in('role', ['admin', 'technician']).maybeSingle(),
    supabase.from('profiles').select('id,role').eq('id', user.id).maybeSingle()
  ]);
  if (!customerMembership && !workshopMembership) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const actorRole = workshopMembership ? 'admin' : 'customer';
  if (actorRole === 'customer' && (payload.docType === 'quote' || payload.docType === 'invoice')) {
    return NextResponse.json({ error: 'Customers cannot upload quote/invoice documents' }, { status: 403 });
  }

  const docInsert = {
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: payload.vehicleId,
    doc_type: payload.docType,
    document_type: payload.docType === 'vehicle_photo' ? 'other' : payload.docType,
    storage_bucket: payload.bucket,
    storage_path: payload.path,
    original_name: payload.originalName,
    mime_type: payload.contentType,
    size_bytes: payload.size,
    subject: payload.subject || null,
    body: payload.body || null,
    importance: payload.importance
  };

  const { data: doc, error } = await supabase.from('vehicle_documents').insert(docInsert).select('id').single();
  if (error || !doc) return NextResponse.json({ error: error?.message ?? 'Could not save upload metadata' }, { status: 400 });

  if (payload.docType === 'vehicle_photo') {
    await supabase.from('vehicles').update({ primary_image_path: payload.path, vehicle_image_doc_id: doc.id }).eq('id', payload.vehicleId);
    await supabase.from('vehicle_timeline_events').insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: payload.vehicleId,
      actor_profile_id: profile?.id ?? user.id,
      actor_role: 'customer',
      event_type: 'doc_uploaded',
      title: 'Vehicle photo updated',
      description: payload.body || null,
      importance: payload.importance,
      metadata: { doc_id: doc.id, type: 'vehicle_photo' }
    });
    return NextResponse.json({ ok: true, documentId: doc.id });
  }

  let linkedEntityId: string | null = null;

  if (payload.docType === 'quote') {
    if (!payload.amountCents || !payload.subject) return NextResponse.json({ error: 'Quote amount and subject are required' }, { status: 400 });
    const { data: quote, error: quoteError } = await supabase.from('quotes').insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: payload.vehicleId,
      total_cents: payload.amountCents,
      subtotal_cents: payload.amountCents,
      notes: payload.body || null,
      status: 'sent',
      document_id: doc.id
    }).select('id').single();
    if (quoteError || !quote) return NextResponse.json({ error: quoteError?.message ?? 'Could not create quote' }, { status: 400 });
    linkedEntityId = quote.id;
    await supabase.from('vehicle_documents').update({ quote_id: quote.id }).eq('id', doc.id);
  } else if (payload.docType === 'invoice') {
    if (!payload.amountCents || !payload.subject) return NextResponse.json({ error: 'Invoice amount and subject are required' }, { status: 400 });
    const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: payload.vehicleId,
      total_cents: payload.amountCents,
      status: 'sent',
      payment_status: 'unpaid',
      document_id: doc.id
    }).select('id').single();
    if (invoiceError || !invoice) return NextResponse.json({ error: invoiceError?.message ?? 'Could not create invoice' }, { status: 400 });
    linkedEntityId = invoice.id;
    await supabase.from('vehicle_documents').update({ invoice_id: invoice.id }).eq('id', doc.id);
  }

  const eventType = payload.docType === 'quote' ? 'quote_created' : payload.docType === 'invoice' ? 'invoice_created' : 'doc_uploaded';
  const title = payload.subject || `Uploaded ${payload.docType.replace('_', ' ')}`;

  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: payload.vehicleId,
    actor_profile_id: profile?.id ?? user.id,
    actor_role: actorRole,
    event_type: eventType,
    title,
    description: payload.body || null,
    importance: payload.importance,
    metadata: { doc_id: doc.id, type: payload.docType, linked_entity_id: linkedEntityId }
  });

  const shouldNotifyCustomer = actorRole === 'admin' && (['quote', 'invoice', 'inspection', 'report'].includes(payload.docType) || payload.importance !== 'info');
  const shouldNotifyWorkshop = actorRole === 'customer' && (payload.docType === 'report');

  if (shouldNotifyCustomer) {
    await supabase.from('notifications').insert({
      workshop_account_id: vehicle.workshop_account_id,
      to_customer_account_id: vehicle.current_customer_account_id,
      kind: payload.docType === 'invoice' ? 'invoice' : payload.docType === 'quote' ? 'quote' : 'report',
      title: payload.subject || `New ${payload.docType.replace('_', ' ')}`,
      body: payload.body || 'A document was uploaded for your vehicle.',
      href: `/customer/vehicles/${payload.vehicleId}`
    });
  }

  if (shouldNotifyWorkshop) {
    await supabase.rpc('push_notification_to_workshop', {
      p_workshop_account_id: vehicle.workshop_account_id,
      p_kind: 'report',
      p_title: payload.subject || 'Customer report uploaded',
      p_body: payload.body || 'A customer uploaded a report document.',
      p_href: `/workshop/vehicles/${payload.vehicleId}`
    });
  }

  return NextResponse.json({ ok: true, documentId: doc.id });
}
