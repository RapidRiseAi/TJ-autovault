import { Card } from '@/components/ui/card';

const events = [
  'Booking created',
  'Checked in',
  'Inspection completed',
  'Quote uploaded',
  'Quote approved',
  'Work started'
];

export default function VehicleDetailPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vehicle details</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Timeline (append-only)</h2>
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event} className="rounded bg-gray-50 p-2">
                {event}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Actions</h2>
          <ul className="space-y-2 text-sm">
            <li>Upload payment proof</li>
            <li>Approve / decline quote</li>
            <li>Submit problem report</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
