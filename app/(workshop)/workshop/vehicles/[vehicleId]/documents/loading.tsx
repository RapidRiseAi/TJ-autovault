import { Card } from '@/components/ui/card';
import { DocumentsSkeleton } from '@/components/customer/vehicle-documents-groups';

export default function WorkshopVehicleDocumentsLoading() {
  return (
    <main className="space-y-4">
      <Card>
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
        </div>
      </Card>
      <DocumentsSkeleton />
    </main>
  );
}
