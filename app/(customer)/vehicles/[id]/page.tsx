import { redirect } from 'next/navigation';

export default async function LegacyVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/customer/vehicles/${id}`);
}
