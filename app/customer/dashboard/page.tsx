import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { ensureCustomerAccountLinked } from '@/lib/customer/ensureCustomerAccountLinked';
import { customerVehicle, customerVehicleNew } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const customerAccount = await ensureCustomerAccountLinked();
  if (!customerAccount) redirect('/customer/profile-required');

  const [{ data: vehicles }, { count: pendingCount }, { count: openTickets }, { count: outstandingRecs }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,year,status,last_service_at,next_service_due_at,next_service_due_km,vehicle_image_doc_id,vehicle_documents!vehicles_vehicle_image_doc_id_fkey(storage_bucket,storage_path)')
      .eq('current_customer_account_id', customerAccount.id)
      .order('created_at', { ascending: false }),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('current_customer_account_id', customerAccount.id).eq('status', 'pending_verification'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccount.id).in('status', ['open', 'in_progress']),
    supabase.from('service_recommendations').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccount.id).eq('status', 'pending')
  ]);

  const stats = [
    ['Total vehicles', vehicles?.length ?? 0],
    ['Pending verification', pendingCount ?? 0],
    ['Outstanding recommendations', outstandingRecs ?? 0],
    ['Open tickets', openTickets ?? 0]
  ];

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">My fleet dashboard</h1><Link href={customerVehicleNew()} className="rounded bg-brand-red px-3 py-2 text-sm text-white">Add vehicle</Link></div>
      <div className="grid gap-3 md:grid-cols-4">{stats.map(([label, value]) => <Card key={label as string}><p className="text-xs uppercase text-gray-500">{label}</p><p className="text-2xl font-bold">{value as number}</p></Card>)}</div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(vehicles ?? []).map((vehicle) => {
          const image = Array.isArray(vehicle.vehicle_documents) ? vehicle.vehicle_documents[0] : vehicle.vehicle_documents;
          const imgUrl = image?.storage_bucket && image?.storage_path ? `/api/uploads/download?bucket=${encodeURIComponent(image.storage_bucket)}&path=${encodeURIComponent(image.storage_path)}` : null;
          return (
            <Card key={vehicle.id} className="space-y-2">
              <div className="h-36 rounded bg-gray-100 bg-cover bg-center" style={imgUrl ? { backgroundImage: `url('${imgUrl}')` } : undefined} />
              <h2 className="text-xl font-semibold">{vehicle.registration_number}</h2>
              <p className="text-sm text-gray-600">{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p>
              <p className="text-xs uppercase">Status: <span className="font-semibold">{vehicle.status ?? 'pending_verification'}</span></p>
              <p className="text-xs text-gray-500">Last service: {vehicle.last_service_at ? new Date(vehicle.last_service_at).toLocaleDateString() : 'N/A'}</p>
              <p className="text-xs text-gray-500">Next due: {vehicle.next_service_due_at ? new Date(vehicle.next_service_due_at).toLocaleDateString() : vehicle.next_service_due_km ? `${vehicle.next_service_due_km} km` : 'N/A'}</p>
              <Link className="text-sm font-medium text-brand-red underline" href={customerVehicle(vehicle.id)}>Open vehicle dashboard</Link>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
