import { redirect } from 'next/navigation';
import { customerVehicle } from '@/lib/routes';

export default async function LegacyVehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  redirect(customerVehicle(vehicleId));
}
