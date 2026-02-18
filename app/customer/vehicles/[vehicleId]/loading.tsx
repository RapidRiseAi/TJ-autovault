import { CustomerVehicleDetailSkeleton } from '@/components/customer/customer-vehicle-detail-view';

export default function VehicleRouteLoading() {
  return (
    <main className="space-y-4">
      <div className="h-8 w-60 animate-pulse rounded bg-gray-200" />
      <CustomerVehicleDetailSkeleton />
    </main>
  );
}
