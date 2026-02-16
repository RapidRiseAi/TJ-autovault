import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const [{ count: pendingVerification }, { count: openJobs }, { count: approvalJobs }, { count: openTickets }, { data: queue }, { data: timeline }, { data: tickets }] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', profile.workshop_account_id).eq('status', 'pending_verification'),
    supabase.from('service_jobs').select('id', { count: 'exact', head: true }).eq('workshop_account_id', profile.workshop_account_id).in('status', ['open', 'in_progress']),
    supabase.from('service_jobs').select('id', { count: 'exact', head: true }).eq('workshop_account_id', profile.workshop_account_id).eq('status', 'awaiting_approval'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('workshop_account_id', profile.workshop_account_id).in('status', ['open', 'in_progress']),
    supabase.from('vehicles').select('id,registration_number,make,model,created_at').eq('workshop_account_id', profile.workshop_account_id).eq('status', 'pending_verification').limit(8),
    supabase.from('vehicle_timeline_events').select('id,title,created_at,event_type').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }).limit(10),
    supabase.from('support_tickets').select('id,category,message,status,created_at').eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false }).limit(10)
  ]);

  const stats = [['Vehicles pending verification', pendingVerification ?? 0], ['Open jobs', openJobs ?? 0], ['Awaiting approval jobs', approvalJobs ?? 0], ['Open tickets', openTickets ?? 0]];

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Workshop dashboard</h1>
      <div className="grid gap-3 md:grid-cols-4">{stats.map(([label, value]) => <Card key={label as string}><p className="text-xs uppercase text-gray-500">{label}</p><p className="text-2xl font-bold">{value as number}</p></Card>)}</div>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1"><h2 className="mb-2 font-semibold">Verification queue</h2>{(queue ?? []).map((v) => <p key={v.id} className="text-sm">{v.registration_number} • {v.make} {v.model}</p>)}</Card>
        <Card className="lg:col-span-1"><h2 className="mb-2 font-semibold">Recent timeline events</h2>{(timeline ?? []).map((e) => <p key={e.id} className="text-sm">{e.title} <span className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</span></p>)}</Card>
        <Card className="lg:col-span-1"><h2 className="mb-2 font-semibold">Tickets</h2>{(tickets ?? []).map((t) => <p key={t.id} className="text-sm">[{t.status}] {t.category}: {t.message.slice(0,60)}</p>)}</Card>
      </section>
    </main>
  );
}
