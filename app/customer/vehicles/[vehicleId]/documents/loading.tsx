import { Card } from '@/components/ui/card';
import { DocumentsSkeleton } from '@/components/customer/vehicle-documents-groups';

export default function LoadingDocumentsPage() {
  return (
    <main className="space-y-4">
      <Card>
        <div className="h-6 w-40 animate-pulse rounded bg-gray-100" />
      </Card>
      <DocumentsSkeleton />
    </main>
  );
}
