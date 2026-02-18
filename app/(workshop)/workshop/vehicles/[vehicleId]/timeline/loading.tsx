import { Card } from '@/components/ui/card';
import { TimelineSkeleton } from '@/components/customer/vehicle-activity';

export default function WorkshopVehicleTimelineLoading() {
  return (
    <main className="space-y-4">
      <Card>
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
        </div>
      </Card>
      <Card>
        <TimelineSkeleton />
      </Card>
    </main>
  );
}
