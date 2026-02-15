import Link from 'next/link';
import { Card } from '@/components/ui/card';

const vehicles = [
  {
    id: 'veh_1',
    rego: 'TJ-123',
    status: 'Awaiting Approval',
    lastService: '2025-01-12',
    nextDue: 'Due in 20 days / 1200km',
    recommendations: 2,
    totalSpend: '$1,240'
  }
];

export default function CustomerDashboardPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Customer dashboard</h1>
      {vehicles.map((vehicle) => (
        <Card key={vehicle.id}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{vehicle.rego}</h2>
              <p className="text-sm text-gray-600">Status: {vehicle.status}</p>
              <p className="text-sm text-gray-600">Last service: {vehicle.lastService}</p>
              <p className="text-sm text-gray-600">Next service: {vehicle.nextDue}</p>
            </div>
            <div className="text-right text-sm">
              <p>Outstanding recs: {vehicle.recommendations}</p>
              <p>Total spend: {vehicle.totalSpend}</p>
              <Link href={`/vehicles/${vehicle.id}`} className="text-brand-red underline">
                View details
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}
