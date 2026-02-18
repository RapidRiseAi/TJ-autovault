import Link from 'next/link';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { RequestForm, MileageForm, QuoteDecisionButtons, RecommendationDecisionButtons } from '@/components/customer/vehicle-actions';
import { UploadsSection } from '@/components/customer/uploads-section';
import { CustomerUploadActions } from '@/components/customer/customer-upload-actions';
import { Card } from '@/components/ui/card';
import { RemoveVehicleButton } from '@/components/customer/remove-vehicle-button';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { buildTimelineActorLabel, importanceBadgeClass } from '@/lib/timeline';

function VehicleAccessErrorPanel() {
  return <main className="space-y-4"><Card><h1 className="text-xl font-semibold">Vehicle unavailable</h1><p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p><Link href={customerDashboard()} className="text-sm text-brand-red underline">Back to dashboard</Link></Card></main>;
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return <VehicleAccessErrorPanel />;
  const customerAccountId = context.customer_account.id;
  const { data: vehicle } = await supabase.from('vehicles').select('id,registration_number,make,model,year,odometer_km,status,next_service_km,next_service_date,primary_image_path').eq('id', vehicleId).eq('current_customer_account_id', customerAccountId).maybeSingle();
  if (!vehicle) return <VehicleAccessErrorPanel />;

  const [{ data: timeline }, { data: quotes }, { data: invoices }, { data: requests }, { data: recommendations }, { data: docs }] = await Promise.all([
    supabase.from('vehicle_timeline_events').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }).limit(50),
    supabase.from('quotes').select('id,status,total_cents').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,status,payment_status,total_cents,due_date').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('work_requests').select('id,request_type,status').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('recommendations').select('id,title,description,severity,status,status_text').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('vehicle_documents').select('id,storage_bucket,storage_path,original_name,created_at,document_type,subject,importance').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false })
  ]);
  const timelineRows = await Promise.all((timeline ?? []).map(async (e) => ({ ...e, actorLabel: await buildTimelineActorLabel(supabase as never, e) })));
  const attachments = (docs ?? []).map((d) => ({ id: d.id, bucket: d.storage_bucket, storage_path: d.storage_path, original_name: d.original_name, created_at: d.created_at, document_type: d.document_type, subject: d.subject, importance: d.importance }));

  return <main className="space-y-4"><Card><div className="flex items-center gap-4">{vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt="Vehicle" className="h-20 w-20 rounded object-cover" /> : null}<div><h1 className="text-2xl font-bold">{vehicle.registration_number}</h1><p className="text-sm text-gray-600">{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p><p className="text-xs uppercase">Status: {vehicle.status} · Odometer: {vehicle.odometer_km ?? 'N/A'} km · Service: {vehicle.next_service_km ?? 'N/A'} km / {vehicle.next_service_date ?? 'N/A'}</p><Link href={`/customer/vehicles/${vehicle.id}/edit`} className="text-sm text-brand-red underline">Edit vehicle</Link></div></div></Card><section id="timeline"><Card><h2 className="text-lg font-semibold">Timeline</h2>{timelineRows.map((event)=><div key={event.id} className="border-l-2 border-brand-red pl-3 my-2"><div className="flex items-center gap-2"><p className="text-sm font-medium">{event.title}</p><span className={`rounded border px-2 py-0.5 text-[10px] ${importanceBadgeClass(event.importance)}`}>{event.importance ?? 'info'}</span>{event.metadata?.urgency ? <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] uppercase text-purple-700">{event.metadata.urgency}</span> : null}</div><p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()} · {event.actorLabel}</p>{event.description ? <p className="text-sm">{event.description}</p> : null}</div>)}</Card></section><section id="quotes"><Card><h2 className="text-lg font-semibold">Quotes</h2>{(quotes ?? []).map((q)=><div key={q.id} className="rounded border p-2 text-sm my-2">{q.status} · R{(q.total_cents / 100).toFixed(2)}<QuoteDecisionButtons quoteId={q.id} /></div>)}</Card></section><section id="invoices"><Card><h2 className="text-lg font-semibold">Invoices</h2>{(invoices ?? []).map((i)=><p key={i.id} className="text-sm">{i.status}/{i.payment_status} · R{(i.total_cents / 100).toFixed(2)} · due {i.due_date ?? 'n/a'}</p>)}</Card></section><Card><h2 className="mb-2 text-lg font-semibold">Requests</h2>{(requests ?? []).map((r)=><p key={r.id} className="text-sm">{r.request_type} · {r.status}</p>)}<RequestForm vehicleId={vehicle.id} /></Card><section id="recommendations"><Card><h2 className="mb-2 text-lg font-semibold">Recommendations</h2>{(recommendations ?? []).map((rec)=><div key={rec.id} className="mb-2 rounded border p-2 text-sm"><p>{rec.title} · {rec.status ?? rec.status_text} · {rec.severity}</p>{rec.description ? <p className="text-xs text-gray-600">{rec.description}</p> : null}<RecommendationDecisionButtons recommendationId={rec.id} /></div>)}</Card></section><section id="uploads"><Card><CustomerUploadActions vehicleId={vehicle.id} /><div className="mt-4"><UploadsSection vehicleId={vehicle.id} attachments={attachments} /></div></Card></section><Card><ReportIssueForm vehicleId={vehicle.id} /></Card><Card><MileageForm vehicleId={vehicle.id} /></Card><RemoveVehicleButton vehicleId={vehicle.id} /><Link href={customerDashboard()} className="text-sm text-brand-red underline">Back to dashboard</Link></main>;
}
