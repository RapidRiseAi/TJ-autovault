import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { buildTimelineActorLabel, importanceBadgeClass } from '@/lib/timeline';
import { UploadsSection } from '@/components/customer/uploads-section';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { WorkflowUploadPanel } from '@/components/workshop/workflow-upload-panel';

export default async function WorkshopVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) notFound();

  const [{ data: vehicle }, { data: jobs }, { data: recs }, { data: timeline }, { data: quotes }, { data: invoices }, { data: docs }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).single(),
    supabase.from('service_jobs').select('id,status,complaint').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('opened_at', { ascending: false }),
    supabase.from('recommendations').select('id,title,status,severity').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('vehicle_timeline_events').select('*').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('quotes').select('id,status,total_cents').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,status,payment_status,total_cents').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('vehicle_documents').select('id,storage_bucket,storage_path,original_name,created_at,document_type,subject,importance').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
  ]);
  if (!vehicle) notFound();

  const timelineRows = await Promise.all((timeline ?? []).map(async (event) => ({ ...event, actorLabel: await buildTimelineActorLabel(supabase as never, event) })));
  const attachments = (docs ?? []).map((d) => ({ id: d.id, bucket: d.storage_bucket, storage_path: d.storage_path, original_name: d.original_name, created_at: d.created_at, document_type: d.document_type, subject: d.subject, importance: d.importance }));

  return <main className="space-y-4"><Card><div className="flex items-center gap-4">{vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt="Vehicle" className="h-20 w-20 rounded object-cover" /> : null}<div><h1 className="text-2xl font-bold">{vehicle.registration_number}</h1><p>{vehicle.make} {vehicle.model}</p><p className="text-xs">Status: {vehicle.status} · Odometer {vehicle.odometer_km ?? 'N/A'} km · Next service {vehicle.next_service_km ?? 'N/A'} km / {vehicle.next_service_date ?? 'N/A'}</p></div></div></Card><div className="grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2 space-y-4"><Card><h2 className="font-semibold">Overview</h2><p className="text-sm">Open jobs: {jobs?.filter((j)=>j.status!=='completed'&&j.status!=='cancelled').length ?? 0}</p></Card><Card><h2 className="font-semibold">Timeline</h2>{(timelineRows ?? []).map((e)=><div key={e.id} className="my-2 border-l-2 pl-2"><div className="flex gap-2"><p>{e.title}</p><span className={`rounded border px-2 text-[10px] ${importanceBadgeClass(e.importance)}`}>{e.importance ?? 'info'}</span></div><p className="text-xs text-gray-500">{e.actorLabel} · {new Date(e.created_at).toLocaleString()}</p></div>)}</Card><Card><UploadsSection vehicleId={vehicle.id} attachments={attachments} /></Card><div className="grid gap-4 md:grid-cols-2"><Card><h2 className="font-semibold">Recommendations</h2>{(recs??[]).map((r)=><p key={r.id} className="text-sm">{r.title} · {r.status} · {r.severity}</p>)}</Card><Card><h2 className="font-semibold">Mileage / payment / jobs</h2><VehicleWorkflowActions vehicleId={vehicle.id} invoices={(invoices??[]).map(i=>({id:i.id}))} jobs={(jobs??[]).map(j=>({id:j.id}))} compact /></Card></div><Card><h2 className="font-semibold">Quotes & invoices</h2>{(quotes??[]).map((q)=><p key={q.id} className="text-sm">Quote {q.status} · R{(q.total_cents/100).toFixed(2)}</p>)}{(invoices??[]).map((i)=><p key={i.id} className="text-sm">Invoice {i.status}/{i.payment_status} · R{(i.total_cents/100).toFixed(2)}</p>)}</Card></div><Card><WorkflowUploadPanel vehicleId={vehicle.id} /></Card></div></main>;
}
