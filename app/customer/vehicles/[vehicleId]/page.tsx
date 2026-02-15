import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,vin,odometer_km,status,current_customer_account_id')
    .eq('id', vehicleId)
    .maybeSingle();

  if (!vehicle) {
    if (process.env.NODE_ENV !== 'production') {
      return (
        <Card className="space-y-2">
          <h1 className="text-xl font-bold">Vehicle not accessible (RLS)</h1>
          <p className="text-sm text-gray-600">Vehicle ID: {vehicleId}</p>
        </Card>
      );
    }

    notFound();
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h1 className="text-2xl font-bold">{vehicle.registration_number}</h1>
        <p className="text-sm text-gray-600">{vehicle.make ? `${vehicle.make} ${vehicle.model ?? ''}`.trim() : 'Make/model unavailable'}</p>
        <p className="text-sm text-gray-600">Status: {vehicle.status ?? 'pending_verification'}</p>
        <p className="text-sm text-gray-600">Year: {vehicle.year ?? 'Not provided'}</p>
        <p className="text-sm text-gray-600">VIN: {vehicle.vin ?? 'Not provided'}</p>
        <p className="text-sm text-gray-600">Current mileage: {vehicle.odometer_km ?? 'Not provided'}</p>
      </Card>

      <Link href={customerDashboard()} className="inline-block text-sm font-medium text-brand-red underline">
        Back to dashboard
      </Link>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Reports</h2>
        <p className="text-sm text-gray-600">No reports yet.</p>
      </Card>
    </div>
  );
}
