import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopCustomersPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const { data: customers } = await supabase.from('customer_accounts').select('id,name').eq('workshop_account_id', profile.workshop_account_id).order('name');

  return (
    <main className="space-y-4">
      <PageHeader title="Customers" subtitle="All customer accounts linked to your workshop." />
      <Card>
        <div className="space-y-1 divide-y divide-black/10">
          {(customers ?? []).map((customer) => (
            <Link key={customer.id} href={`/workshop/customers/${customer.id}`} className="flex items-center justify-between py-3 text-sm font-medium text-brand-black first:pt-0 last:pb-0 hover:text-brand-red">
              <span>{customer.name}</span>
              <span className="text-xs text-gray-500">Open</span>
            </Link>
          ))}
          {!customers?.length ? <p className="py-2 text-sm text-gray-500">No customers yet.</p> : null}
        </div>
      </Card>
    </main>
  );
}
