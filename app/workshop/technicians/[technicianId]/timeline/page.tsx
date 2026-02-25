import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { createClient } from '@/lib/supabase/server';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(cents / 100);
}

type TimelineItem = {
  id: string;
  at: string;
  title: string;
  details: string;
  href?: string;
};

export default async function TechnicianTimelinePage({
  params
}: {
  params: Promise<{ technicianId: string }>;
}) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { technicianId } = await params;

  const { data: actor } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!actor?.workshop_account_id || (actor.role !== 'admin' && actor.role !== 'technician')) {
    redirect('/customer/dashboard');
  }

  if (actor.role === 'technician' && actor.id !== technicianId) {
    redirect('/workshop/dashboard');
  }

  const workshopId = actor.workshop_account_id;

  const [{ data: technician }, { data: attendance }, { data: payouts }, { data: reports }, { data: jobEvents }, { data: uploads }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,display_name,full_name,role,workshop_account_id')
      .eq('id', technicianId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
    supabase
      .from('technician_attendance')
      .select('id,clock_in_at,clock_out_at,created_at,clocked_in')
      .eq('workshop_account_id', workshopId)
      .eq('technician_profile_id', technicianId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('technician_payouts')
      .select('id,amount_cents,status,paid_at,confirmed_at,created_at')
      .eq('workshop_account_id', workshopId)
      .eq('technician_profile_id', technicianId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('inspection_reports')
      .select('id,vehicle_id,created_at')
      .eq('workshop_account_id', workshopId)
      .eq('technician_profile_id', technicianId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('job_card_events')
      .select('id,event_type,created_at,job_card_id,job_cards!inner(id,workshop_id)')
      .eq('created_by', technicianId)
      .eq('job_cards.workshop_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('job_card_photos')
      .select('id,created_at,job_card_id,job_cards!inner(id,workshop_id)')
      .eq('uploaded_by', technicianId)
      .eq('job_cards.workshop_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  if (!technician || technician.role !== 'technician') {
    redirect('/workshop/technicians');
  }

  const timeline: TimelineItem[] = [
    ...(attendance ?? []).map((entry) => ({
      id: `attendance-${entry.id}`,
      at: entry.created_at,
      title: entry.clocked_in ? 'Clocked in' : 'Attendance update',
      details: entry.clock_out_at
        ? `Shift ended ${new Date(entry.clock_out_at).toLocaleString('en-ZA')}`
        : `Shift started ${new Date(entry.clock_in_at).toLocaleString('en-ZA')}`
    })),
    ...(payouts ?? []).map((entry) => ({
      id: `payout-${entry.id}`,
      at: entry.created_at,
      title:
        entry.status === 'confirmed'
          ? 'Payout confirmed'
          : entry.status === 'pending_confirmation'
            ? 'Payout waiting for confirmation'
            : 'Payout recorded',
      details: `${formatCurrency(entry.amount_cents ?? 0)} paid ${entry.paid_at ? new Date(entry.paid_at).toLocaleDateString('en-ZA') : ''}`.trim()
    })),
    ...(reports ?? []).map((entry) => ({
      id: `report-${entry.id}`,
      at: entry.created_at,
      title: 'Inspection report submitted',
      details: `Vehicle ${entry.vehicle_id.slice(0, 8).toUpperCase()}`
    })),
    ...(jobEvents ?? []).map((entry) => ({
      id: `job-event-${entry.id}`,
      at: entry.created_at,
      title: 'Job card activity',
      details: `Event: ${entry.event_type.replace(/_/g, ' ')}`,
      href: `/workshop/jobs/${entry.job_card_id}`
    })),
    ...(uploads ?? []).map((entry) => ({
      id: `upload-${entry.id}`,
      at: entry.created_at,
      title: 'Photo uploaded',
      details: `Uploaded to job card ${entry.job_card_id.slice(0, 8).toUpperCase()}`,
      href: `/workshop/jobs/${entry.job_card_id}`
    }))
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const technicianName = technician.display_name ?? technician.full_name ?? 'Technician';

  return (
    <main className="space-y-4">
      <PageHeader
        title={`${technicianName} timeline`}
        subtitle="Recent attendance, payouts, inspections, and job card updates."
        actions={
          <Link href="/workshop/technicians" className="text-sm font-semibold text-brand-red underline-offset-4 hover:underline">
            Back to technicians
          </Link>
        }
      />

      <SectionCard className="rounded-3xl p-6">
        {timeline.length ? (
          <div className="space-y-3">
            {timeline.map((item) => (
              <div key={item.id} className="rounded-xl border border-black/10 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">{new Date(item.at).toLocaleString('en-ZA')}</p>
                <p className="mt-1 text-sm text-gray-700">{item.details}</p>
                {item.href ? (
                  <Link href={item.href} className="mt-1 inline-flex text-xs font-semibold text-brand-red underline-offset-4 hover:underline">
                    Open related job card
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">No timeline activity yet for this technician.</p>
        )}
      </SectionCard>
    </main>
  );
}
