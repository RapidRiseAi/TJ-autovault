import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { createZipBuffer } from '@/lib/zip';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function getWorkshopContext() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return null;
  }

  return profile;
}

export async function GET(_: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const context = await getWorkshopContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: request, error: requestError } = await admin
    .from('vehicle_deletion_requests')
    .select('id,vehicle_id,customer_account_id,workshop_account_id,status,requested_at,reason')
    .eq('id', requestId)
    .eq('workshop_account_id', context.workshop_account_id)
    .maybeSingle();

  if (requestError || !request) {
    return NextResponse.json({ error: requestError?.message ?? 'Deletion request not found' }, { status: 404 });
  }

  const vehicleId = request.vehicle_id;

  const [
    vehicleResult,
    ownershipResult,
    documentsResult,
    mediaResult,
    timelineResult,
    workRequestsResult,
    quotesResult,
    invoicesResult,
    recommendationsResult,
    jobsResult,
    reportsResult,
    attachmentsResult,
    consentResult
  ] = await Promise.all([
    admin.from('vehicles').select('*').eq('id', vehicleId).maybeSingle(),
    admin.from('vehicle_ownership_history').select('*').eq('vehicle_id', vehicleId).order('transferred_at', { ascending: false }),
    admin.from('vehicle_documents').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('vehicle_media').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('vehicle_timeline_events').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('work_requests').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('quotes').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('invoices').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('recommendations').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('service_jobs').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('problem_reports').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('attachments').select('*').eq('entity_type', 'vehicle').eq('entity_id', vehicleId).order('created_at', { ascending: false }),
    admin.from('consent_records').select('*').eq('vehicle_id', vehicleId).order('created_at', { ascending: false })
  ]);

  const quoteIds = (quotesResult.data ?? []).map((row) => row.id);
  const invoiceIds = (invoicesResult.data ?? []).map((row) => row.id);

  const quoteItemsResult = quoteIds.length
    ? await admin.from('quote_items').select('*').in('quote_id', quoteIds)
    : { data: [] as unknown[], error: null };
  const invoiceItemsResult = invoiceIds.length
    ? await admin.from('invoice_items').select('*').in('invoice_id', invoiceIds)
    : { data: [] as unknown[], error: null };

  const docs = documentsResult.data ?? [];
  const media = mediaResult.data ?? [];
  const attachments = attachmentsResult.data ?? [];

  const storageRefs = [
    ...docs.map((doc) => ({ bucket: doc.storage_bucket as string, path: doc.storage_path as string })),
    ...media.map((row) => ({ bucket: row.storage_bucket as string, path: row.storage_path as string })),
    ...attachments
      .filter((row) => typeof row.bucket === 'string' && typeof row.storage_path === 'string')
      .map((row) => ({ bucket: row.bucket as string, path: row.storage_path as string }))
  ];

  const files: Array<{ path: string; content: Buffer }> = [
    { path: 'data/deletion_request.json', content: Buffer.from(JSON.stringify(request, null, 2), 'utf8') },
    { path: 'data/vehicle.json', content: Buffer.from(JSON.stringify(vehicleResult.data ?? null, null, 2), 'utf8') },
    { path: 'data/vehicle_ownership_history.json', content: Buffer.from(JSON.stringify(ownershipResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/vehicle_documents.json', content: Buffer.from(JSON.stringify(docs, null, 2), 'utf8') },
    { path: 'data/vehicle_media.json', content: Buffer.from(JSON.stringify(media, null, 2), 'utf8') },
    { path: 'data/vehicle_timeline_events.json', content: Buffer.from(JSON.stringify(timelineResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/work_requests.json', content: Buffer.from(JSON.stringify(workRequestsResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/quotes.json', content: Buffer.from(JSON.stringify(quotesResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/quote_items.json', content: Buffer.from(JSON.stringify(quoteItemsResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/invoices.json', content: Buffer.from(JSON.stringify(invoicesResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/invoice_items.json', content: Buffer.from(JSON.stringify(invoiceItemsResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/recommendations.json', content: Buffer.from(JSON.stringify(recommendationsResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/service_jobs.json', content: Buffer.from(JSON.stringify(jobsResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/problem_reports.json', content: Buffer.from(JSON.stringify(reportsResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/attachments.json', content: Buffer.from(JSON.stringify(attachments, null, 2), 'utf8') },
    { path: 'data/consent_records.json', content: Buffer.from(JSON.stringify(consentResult.data ?? [], null, 2), 'utf8') },
    { path: 'data/storage_manifest.json', content: Buffer.from(JSON.stringify(storageRefs, null, 2), 'utf8') }
  ];

  for (const [index, file] of storageRefs.entries()) {
    const { data } = await admin.storage.from(file.bucket).download(file.path);
    if (!data) continue;
    const arrayBuffer = await data.arrayBuffer();
    const safePath = file.path.replace(/^\/+/, '').replace(/\.\./g, '_');
    files.push({ path: `files/${String(index + 1).padStart(3, '0')}-${file.bucket}-${safePath}`, content: Buffer.from(arrayBuffer) });
  }

  const zipBuffer = createZipBuffer(files);

  await admin
    .from('vehicle_deletion_requests')
    .update({
      status: request.status === 'pending' ? 'exported' : request.status,
      exported_at: new Date().toISOString(),
      processed_by_profile_id: context.id,
      metadata: {
        ...(request as { metadata?: Record<string, unknown> }).metadata,
        last_exported_by: context.id,
        last_exported_at: new Date().toISOString()
      }
    })
    .eq('id', request.id)
    .eq('workshop_account_id', context.workshop_account_id);

  await admin.from('vehicle_timeline_events').insert({
    workshop_account_id: request.workshop_account_id,
    customer_account_id: request.customer_account_id,
    vehicle_id: request.vehicle_id,
    actor_profile_id: context.id,
    actor_role: 'admin',
    event_type: 'deletion_exported',
    title: 'Vehicle archive exported',
    description: 'Workshop exported vehicle archive before permanent deletion.',
    metadata: { deletion_request_id: request.id },
    importance: 'info'
  });

  const fileName = `vehicle-${vehicleId}-archive-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`
    }
  });
}
