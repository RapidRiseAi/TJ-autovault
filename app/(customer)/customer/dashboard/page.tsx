import Link from 'next/link';
import { Card } from '@/components/ui/card';

const vehicles = [
  {
    id: '33333333-3333-3333-3333-333333333333',
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
        <Link key={vehicle.id} href={`/customer/vehicles/${vehicle.id}`} className="block">
          <Card className="transition hover:border-brand-red/40 hover:shadow-md">
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
                <span className="text-brand-red underline">View details</span>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </main>
  );
}
