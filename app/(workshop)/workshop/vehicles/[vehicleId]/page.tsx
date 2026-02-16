import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) notFound();

  const [{ data: vehicle }, { data: jobs }, { data: recs }, { data: timeline }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).single(),
    supabase.from('service_jobs').select('*').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('opened_at', { ascending: false }),
    supabase.from('service_recommendations').select('*').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }),
    supabase.from('vehicle_timeline_events').select('*').eq('vehicle_id', vehicleId).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
  ]);

  if (!vehicle) notFound();

  return (
    <main className="space-y-4">
      <Card><h1 className="text-2xl font-bold">{vehicle.registration_number}</h1><p>{vehicle.make} {vehicle.model}</p><p>Status: {vehicle.status}</p></Card>
      <Card><h2 className="font-semibold">Jobs</h2>{(jobs ?? []).map((j) => <p key={j.id}>{j.status} · {j.complaint ?? 'No complaint'}</p>)}</Card>
      <Card><h2 className="font-semibold">Recommendations</h2>{(recs ?? []).map((r) => <p key={r.id}>{r.title} · {r.status}</p>)}</Card>
      <Card><h2 className="font-semibold">Timeline</h2>{(timeline ?? []).map((e) => <p key={e.id}>{e.title}</p>)}</Card>
    </main>
  );
}
