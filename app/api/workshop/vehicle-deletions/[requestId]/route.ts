import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function getWorkshopAdminContext() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || profile.role !== 'admin') {
    return null;
  }

  return profile;
}

export async function DELETE(_: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const context = await getWorkshopAdminContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: request, error: requestError } = await admin
    .from('vehicle_deletion_requests')
    .select('id,vehicle_id,customer_account_id,workshop_account_id,status,metadata')
    .eq('id', requestId)
    .eq('workshop_account_id', context.workshop_account_id)
    .maybeSingle();

  if (requestError || !request) {
    return NextResponse.json({ error: requestError?.message ?? 'Deletion request not found' }, { status: 404 });
  }

  const vehicleId = request.vehicle_id;

  const [documentsResult, mediaResult, attachmentsResult] = await Promise.all([
    admin.from('vehicle_documents').select('storage_bucket,storage_path').eq('vehicle_id', vehicleId),
    admin.from('vehicle_media').select('storage_bucket,storage_path').eq('vehicle_id', vehicleId),
    admin.from('attachments').select('bucket,storage_path').eq('entity_type', 'vehicle').eq('entity_id', vehicleId)
  ]);

  const storageByBucket = new Map<string, string[]>();

  const allRefs = [
    ...(documentsResult.data ?? []).map((row) => ({ bucket: row.storage_bucket, path: row.storage_path })),
    ...(mediaResult.data ?? []).map((row) => ({ bucket: row.storage_bucket, path: row.storage_path })),
    ...(attachmentsResult.data ?? [])
      .filter((row) => typeof row.bucket === 'string' && typeof row.storage_path === 'string')
      .map((row) => ({ bucket: row.bucket as string, path: row.storage_path as string }))
  ];

  for (const ref of allRefs) {
    if (!storageByBucket.has(ref.bucket)) storageByBucket.set(ref.bucket, []);
    storageByBucket.get(ref.bucket)?.push(ref.path);
  }


  const { data: quotes } = await admin.from('quotes').select('id').eq('vehicle_id', vehicleId);
  const { data: invoices } = await admin.from('invoices').select('id').eq('vehicle_id', vehicleId);
  const quoteIds = (quotes ?? []).map((row) => row.id);
  const invoiceIds = (invoices ?? []).map((row) => row.id);

  for (const [bucket, paths] of storageByBucket) {
    if (!paths.length) continue;
    await admin.storage.from(bucket).remove(paths);
  }

  if (quoteIds.length) await admin.from('quote_items').delete().in('quote_id', quoteIds);
  if (invoiceIds.length) await admin.from('invoice_items').delete().in('invoice_id', invoiceIds);
  await admin.from('work_requests').delete().eq('vehicle_id', vehicleId);
  await admin.from('quotes').delete().eq('vehicle_id', vehicleId);
  await admin.from('invoices').delete().eq('vehicle_id', vehicleId);
  await admin.from('recommendations').delete().eq('vehicle_id', vehicleId);
  await admin.from('service_jobs').delete().eq('vehicle_id', vehicleId);
  await admin.from('problem_reports').delete().eq('vehicle_id', vehicleId);
  await admin.from('vehicle_timeline_events').delete().eq('vehicle_id', vehicleId);
  await admin.from('vehicle_documents').delete().eq('vehicle_id', vehicleId);
  await admin.from('vehicle_media').delete().eq('vehicle_id', vehicleId);
  await admin.from('attachments').delete().eq('entity_type', 'vehicle').eq('entity_id', vehicleId);
  await admin.from('consent_records').delete().eq('vehicle_id', vehicleId);
  await admin.from('vehicle_ownership_history').delete().eq('vehicle_id', vehicleId);

  const { error: deleteVehicleError } = await admin.from('vehicles').delete().eq('id', vehicleId);
  if (deleteVehicleError) {
    return NextResponse.json({ error: deleteVehicleError.message }, { status: 500 });
  }

  await admin
    .from('vehicle_deletion_requests')
    .update({
      status: 'deleted',
      processed_at: new Date().toISOString(),
      processed_by_profile_id: context.id,
      metadata: {
        ...(request.metadata as Record<string, unknown> | null),
        deleted_storage_objects: allRefs.length,
        deleted_at: new Date().toISOString(),
        deleted_by: context.id
      }
    })
    .eq('id', request.id)
    .eq('workshop_account_id', context.workshop_account_id);


  return NextResponse.json({ ok: true });
}
