import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';

export default function CustomerPlanPage() {
  return (
    <main className="space-y-4">
      <PageHeader title="Billing & plan" subtitle="Plan upgrades and payments are coming soon." />
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { tier: 'Plan 1', price: 'R200 / month', limit: '1 to 3 cars · 250MB storage' },
          { tier: 'Plan 2', price: 'R500 / month', limit: 'Up to 10 cars · 1GB storage' },
          { tier: 'Plan 3', price: 'R1000 / month', limit: 'Unlimited cars · 10GB storage' }
        ].map((plan) => (
          <Card key={plan.tier}>
            <p className="text-xs uppercase text-gray-500">{plan.tier}</p>
            <p className="mt-1 text-xl font-semibold">{plan.price}</p>
            <p className="text-sm text-gray-600">{plan.limit}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
