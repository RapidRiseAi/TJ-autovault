import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  dispatchNotificationEmailsNow,
  dispatchRecentCustomerNotifications,
  dispatchRecentWorkshopNotifications
} from '@/lib/email/dispatch-now';
import { addDaysToIsoDate, getNextDocumentReference } from '@/lib/workshop/document-references';

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
  urgency: z
    .enum(['info', 'low', 'medium', 'high', 'critical'])
    .default('info'),
  amountCents: z.number().int().nonnegative().optional(),
  referenceNumber: z.string().trim().min(1).max(64).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  quoteId: z.string().uuid().optional(),
  technicianProfileId: z.string().uuid().optional(),
  reportId: z.string().uuid().optional(),
  odometerKm: z.number().int().nonnegative().optional()
});

function canonicalDocType(docType: z.infer<typeof requestSchema>['docType']) {
  if (docType === 'before_photos') return 'before_images';
  if (docType === 'after_photos') return 'after_images';
  if (docType === 'inspection_report') return 'inspection';
  if (docType === 'warning') return 'report';
  return docType;
}

function urgencyToImportance(
  urgency: z.infer<typeof requestSchema>['urgency']
) {
  if (urgency === 'high' || urgency === 'critical') return 'urgent';
  if (urgency === 'low' || urgency === 'medium') return 'warning';
  return 'info';
}

function extractNotificationId(payload: unknown): string | null {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return null;

  const candidate = (payload as { id?: unknown }).id;
  return typeof candidate === 'string' ? candidate : null;
}

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid request payload' },
      { status: 400 }
    );

  const payload = parsed.data;
  const normalizedDocType = canonicalDocType(payload.docType);
  const warningUpload = payload.docType === 'warning';
  const normalizedImportance = warningUpload
    ? payload.importance === 'urgent'
      ? 'urgent'
      : 'warning'
    : (payload.importance ?? urgencyToImportance(payload.urgency));

  if (warningUpload && (!payload.subject?.trim() || !payload.body?.trim())) {
    return NextResponse.json(
      { error: 'Warning uploads require both subject and body.' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select(
      'id,registration_number,workshop_account_id,current_customer_account_id,odometer_km'
    )
    .eq('id', payload.vehicleId)
    .maybeSingle();
  if (!vehicle?.current_customer_account_id)
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const [
    { data: customerMembership },
    { data: workshopMembership },
    { data: profile },
    { data: customerAccount, error: customerAccountError }
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select('id')
      .eq('auth_user_id', user.id)
      .eq('id', vehicle.current_customer_account_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id,role')
      .eq('id', user.id)
      .eq('workshop_account_id', vehicle.workshop_account_id)
      .in('role', ['admin', 'technician'])
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id,role,display_name')
      .eq('id', user.id)
      .maybeSingle(),
    admin
      .from('customer_accounts')
      .select('name,linked_email,auth_user_id')
      .eq('id', vehicle.current_customer_account_id)
      .maybeSingle()
  ]);

  if (customerAccountError) {
    return NextResponse.json(
      { error: customerAccountError.message },
      { status: 400 }
    );
  }

  if (!customerMembership && !workshopMembership)
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const actorRole = workshopMembership ? 'admin' : 'customer';
  if (
    actorRole === 'customer' &&
    (normalizedDocType === 'quote' || normalizedDocType === 'invoice')
  ) {
    return NextResponse.json(
      { error: 'Customers cannot upload quote/invoice documents' },
      { status: 403 }
    );
  }

  const docInsert = {
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: payload.vehicleId,
    doc_type: normalizedDocType,
    document_type:
      normalizedDocType === 'vehicle_photo' ? 'other' : normalizedDocType,
    storage_bucket: payload.bucket,
    storage_path: payload.path,
    original_name: payload.originalName,
    mime_type: payload.contentType,
    size_bytes: payload.size,
    subject: payload.subject || null,
    body: payload.body || null,
    importance: normalizedImportance
  };

  const { data: doc, error } = await supabase
    .from('vehicle_documents')
    .insert(docInsert)
    .select('id')
    .single();
  if (error || !doc)
    return NextResponse.json(
      { error: error?.message ?? 'Could not save upload metadata' },
      { status: 400 }
    );

  if (normalizedDocType === 'vehicle_photo') {
    await supabase
      .from('vehicles')
      .update({
        primary_image_path: payload.path,
        vehicle_image_doc_id: doc.id
      })
      .eq('id', payload.vehicleId);
  }

  if (payload.docType === 'inspection_report') {
    if (!payload.technicianProfileId) {
      return NextResponse.json({ error: 'Technician is required for inspection reports' }, { status: 400 });
    }
    if (payload.odometerKm == null) {
      return NextResponse.json({ error: 'Mileage is required for inspection reports' }, { status: 400 });
    }

    const currentMileage = vehicle.odometer_km ?? 0;
    if (payload.odometerKm < currentMileage) {
      return NextResponse.json(
        { error: `Mileage cannot be less than current mileage (${currentMileage.toLocaleString()} km)` },
        { status: 400 }
      );
    }

    const reportInsert: Record<string, unknown> = {
      workshop_account_id: vehicle.workshop_account_id,
      vehicle_id: payload.vehicleId,
      mode: 'upload',
      technician_profile_id: payload.technicianProfileId,
      notes: payload.body || null,
      uploaded_storage_path: payload.path,
      created_by: user.id
    };
    if (payload.reportId) reportInsert.id = payload.reportId;

    await supabase.from('inspection_reports').insert(reportInsert);

    await supabase.from('vehicles').update({ odometer_km: payload.odometerKm }).eq('id', payload.vehicleId);

    await supabase.from('vehicle_timeline_events').insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: payload.vehicleId,
      actor_profile_id: user.id,
      actor_role: workshopMembership ? 'admin' : 'customer',
      event_type: 'inspection_report_added',
      title: payload.subject || 'Inspection report uploaded',
      description: 'Inspection report added',
      importance: normalizedImportance,
      metadata: {
        mode: 'upload',
        display_name: payload.subject || payload.originalName,
        doc_id: doc.id
      }
    });
  }

  let linkedEntityId: string | null = null;

  if (normalizedDocType === 'quote') {
    if (!payload.amountCents || !payload.subject)
      return NextResponse.json(
        { error: 'Quote amount and subject are required' },
        { status: 400 }
      );
    const quoteReference =
      payload.referenceNumber?.trim() ||
      (await getNextDocumentReference({
        supabase,
        workshopAccountId: vehicle.workshop_account_id,
        kind: 'quote'
      }));

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
        quote_number: quoteReference,
        document_id: doc.id
      })
      .select('id')
      .single();
    if (quoteError || !quote)
      return NextResponse.json(
        { error: quoteError?.message ?? 'Could not create quote' },
        { status: 400 }
      );
    linkedEntityId = quote.id;
    await supabase
      .from('vehicle_documents')
      .update({ quote_id: quote.id })
      .eq('id', doc.id);
  } else if (normalizedDocType === 'invoice') {
    if (!payload.amountCents || !payload.subject)
      return NextResponse.json(
        { error: 'Invoice amount and subject are required' },
        { status: 400 }
      );

    if (payload.quoteId) {
      const { data: quoteLink } = await supabase
        .from('quotes')
        .select('id')
        .eq('id', payload.quoteId)
        .eq('vehicle_id', payload.vehicleId)
        .eq('workshop_account_id', vehicle.workshop_account_id)
        .maybeSingle();
      if (!quoteLink)
        return NextResponse.json(
          { error: 'Invalid quote selected for invoice.' },
          { status: 400 }
        );
    }
    const invoiceReference =
      payload.referenceNumber?.trim() ||
      (await getNextDocumentReference({
        supabase,
        workshopAccountId: vehicle.workshop_account_id,
        kind: 'invoice'
      }));

    const dueDate = payload.dueDate || addDaysToIsoDate(new Date().toISOString().slice(0, 10), 7);

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        workshop_account_id: vehicle.workshop_account_id,
        customer_account_id: vehicle.current_customer_account_id,
        vehicle_id: payload.vehicleId,
        total_cents: payload.amountCents,
        status: 'sent',
        payment_status: 'unpaid',
        invoice_number: invoiceReference,
        due_date: dueDate,
        subject: payload.subject,
        notes: payload.body || null,
        quote_id: payload.quoteId || null,
        document_id: doc.id
      })
      .select('id')
      .single();
    if (invoiceError || !invoice)
      return NextResponse.json(
        { error: invoiceError?.message ?? 'Could not create invoice' },
        { status: 400 }
      );
    linkedEntityId = invoice.id;
    await supabase
      .from('vehicle_documents')
      .update({ invoice_id: invoice.id })
      .eq('id', doc.id);
  }

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

  const shouldNotifyCustomer =
    actorRole === 'admin' &&
    (['quote', 'invoice', 'inspection', 'report'].includes(normalizedDocType) ||
      normalizedImportance !== 'info');
  const shouldNotifyWorkshop =
    actorRole === 'customer' && normalizedDocType === 'report';

  if (shouldNotifyCustomer) {
    const notificationKind =
      normalizedDocType === 'invoice'
        ? 'invoice'
        : normalizedDocType === 'quote'
          ? 'quote'
          : 'report';
    const customerHref = `/customer/vehicles/${payload.vehicleId}`;

    const { data: notificationResult, error: notificationError } = await supabase.rpc('push_notification', {
      p_workshop_account_id: vehicle.workshop_account_id,
      p_to_customer_account_id: vehicle.current_customer_account_id,
      p_kind: notificationKind,
      p_title: payload.subject || `New ${normalizedDocType.replace('_', ' ')}`,
      p_body: payload.body || 'A document was uploaded for your vehicle.',
      p_href: customerHref,
      p_data: notificationData
    });

    if (notificationError) {
      console.error('Could not create customer notification for upload', notificationError);
    } else {
      const notificationId = extractNotificationId(notificationResult);
      if (notificationId) {
        await dispatchNotificationEmailsNow([notificationId]);
      } else {
        await dispatchRecentCustomerNotifications({
          customerAccountId: vehicle.current_customer_account_id,
          kind: notificationKind,
          href: notificationKind === 'report' ? customerHref : undefined
        });
      }
    }
  }

  if (shouldNotifyWorkshop) {
    const workshopHref = `/workshop/vehicles/${payload.vehicleId}`;

    await supabase.rpc('push_notification_to_workshop', {
      p_workshop_account_id: vehicle.workshop_account_id,
      p_kind: 'report',
      p_title: payload.subject || 'Customer report uploaded',
      p_body: payload.body || 'A customer uploaded a report document.',
      p_href: workshopHref,
      p_data: notificationData
    });

    await dispatchRecentWorkshopNotifications({
      workshopAccountId: vehicle.workshop_account_id,
      kind: 'report',
      href: workshopHref
    });
  }

  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    bucket: payload.bucket,
    path: payload.path
  });
}
