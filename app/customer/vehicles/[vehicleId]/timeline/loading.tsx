import { Card } from '@/components/ui/card';
import { TimelineSkeleton } from '@/components/customer/vehicle-activity';

export default function LoadingTimelinePage() {
  return (
    <main className="space-y-4">
      <Card>
        <div className="h-6 w-44 animate-pulse rounded bg-gray-100" />
      </Card>
      <Card>
        <TimelineSkeleton />
      </Card>
    </main>
  );
}
