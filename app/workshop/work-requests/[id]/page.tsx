import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WorkRequestStatusForm } from '@/components/workshop/work-request-status-form';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopWorkRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const { data: request } = await supabase
    .from('work_requests')
    .select('id,vehicle_id,request_type,status,notes,preferred_date,created_at,vehicles(registration_number,make,model),customer_accounts(name)')
    .eq('id', id)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (!request) notFound();

  return (
    <main className="space-y-4">
      <PageHeader
        title="Work request detail"
        subtitle="Review request details and update status."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/workshop/work-requests">Back to list</Link>
          </Button>
        }
      />

      <Card className="space-y-2 text-sm">
        <p><span className="font-semibold">Type:</span> {request.request_type}</p>
        <p><span className="font-semibold">Status:</span> {request.status.replaceAll('_', ' ')}</p>
        <p><span className="font-semibold">Customer:</span> {request.customer_accounts?.[0]?.name ?? 'Unknown customer'}</p>
        <p><span className="font-semibold">Vehicle:</span> {request.vehicles?.[0]?.registration_number ?? 'Unknown registration'} {request.vehicles?.[0]?.make ?? ''} {request.vehicles?.[0]?.model ?? ''}</p>
        <p><span className="font-semibold">Preferred date:</span> {request.preferred_date ?? 'n/a'}</p>
        <p><span className="font-semibold">Notes:</span> {request.notes ?? 'n/a'}</p>
        <p className="text-xs text-gray-500">Created {new Date(request.created_at).toLocaleString()}</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Update status</h2>
        <WorkRequestStatusForm workRequestId={request.id} initialStatus={request.status} />
      </Card>

      <Card>
        <Link href={`/workshop/vehicles/${request.vehicle_id}`} className="text-sm font-semibold text-brand-red underline">Open vehicle timeline</Link>
      </Card>
    </main>
  );
}
