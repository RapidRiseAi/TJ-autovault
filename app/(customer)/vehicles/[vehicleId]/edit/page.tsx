import { redirect } from 'next/navigation';

export default async function LegacyCustomerVehicleEditPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  redirect(`/customer/vehicles/${vehicleId}/edit`);
}
