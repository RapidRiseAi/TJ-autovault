import { Card } from '@/components/ui/card';

export default function WorkOrderDetailPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Work order detail</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Digital inspection builder</h2>
          <p className="text-sm text-gray-600">
            Sections and inspection items are created per job and stored as JSON plus normalized rows.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Upload center</h2>
          <ul className="list-disc pl-4 text-sm text-gray-600">
            <li>Before/after photos (required)</li>
            <li>Quote PDF upload + send</li>
            <li>Invoice PDF upload + send</li>
          </ul>
        </Card>
      </div>
    </main>
  );
}
