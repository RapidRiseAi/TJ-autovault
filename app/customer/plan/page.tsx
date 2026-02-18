import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';

export default function CustomerPlanPage() {
  return (
    <main className="space-y-4">
      <PageHeader title="Billing & plan" subtitle="Plan upgrades and payments are coming soon." />
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { tier: 'Basic', price: 'R100 / month', limit: '1 vehicle' },
          { tier: 'Pro', price: 'R700 / month', limit: '10 vehicles' },
          { tier: 'Business', price: 'R1200 / month', limit: '20 vehicles' }
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
