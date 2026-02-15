import { redirect } from 'next/navigation';
import { customerVehicle } from '@/lib/routes';

export default async function LegacyVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(customerVehicle(id));
}
