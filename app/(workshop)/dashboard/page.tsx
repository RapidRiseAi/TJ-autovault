import { Card } from '@/components/ui/card';

const counters = [
  ['Awaiting inspection', 4],
  ['Awaiting approval', 3],
  ['In progress', 7],
  ['Ready', 2],
  ['Overdue', 1]
];

const lanes = ['Booked', 'Checked In', 'Inspecting', 'Awaiting Approval', 'Approved', 'In Progress', 'QC', 'Ready', 'Closed'];

export default function WorkshopDashboardPage() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Workshop dashboard</h1>
      <div className="grid gap-3 md:grid-cols-5">
        {counters.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Job board</h2>
        <div className="grid gap-3 overflow-auto md:grid-cols-5 lg:grid-cols-9">
          {lanes.map((lane) => (
            <Card key={lane} className="min-h-36 bg-gray-50">
              <h3 className="mb-2 text-sm font-semibold">{lane}</h3>
              <div className="rounded bg-white p-2 text-xs">WO-1024 TJ-123</div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
