import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UploadsSection } from '@/components/customer/uploads-section';
import { Card } from '@/components/ui/card';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export default async function VehicleDetailPage({
  params
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!customerAccount) notFound();

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select(
      'id,registration_number,make,model,year,vin,odometer_km,status,current_customer_account_id'
    )
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccount.id)
    .maybeSingle();

  if (!vehicle) {
    return (
      <main className="space-y-4">
        <Card className="space-y-2">
          <h1 className="text-xl font-bold">
            Vehicle not found or you don&apos;t have access
          </h1>
          <p className="text-sm text-gray-600">
            Please confirm the vehicle belongs to your account.
          </p>
        </Card>
        <Link
          href={customerDashboard()}
          className="inline-block text-sm font-medium text-brand-red underline"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  const { data: attachments } = await supabase
    .from('attachments')
    .select(
      'id,bucket,storage_path,original_name,mime_type,size_bytes,created_at'
    )
    .eq('entity_type', 'vehicle')
    .eq('entity_id', vehicle.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h1 className="text-2xl font-bold">{vehicle.registration_number}</h1>
        <p className="text-sm text-gray-600">
          {vehicle.make
            ? `${vehicle.make} ${vehicle.model ?? ''}`.trim()
            : 'Make/model unavailable'}
        </p>
        <p className="text-sm text-gray-600">
          Status: {vehicle.status ?? 'pending_verification'}
        </p>
        <p className="text-sm text-gray-600">
          Year: {vehicle.year ?? 'Not provided'}
        </p>
        <p className="text-sm text-gray-600">
          VIN: {vehicle.vin ?? 'Not provided'}
        </p>
        <p className="text-sm text-gray-600">
          Current mileage: {vehicle.odometer_km ?? 'Not provided'}
        </p>
      </Card>

      <UploadsSection vehicleId={vehicle.id} attachments={attachments ?? []} />

      <Link
        href={customerDashboard()}
        className="inline-block text-sm font-medium text-brand-red underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
