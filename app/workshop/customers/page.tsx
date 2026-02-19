import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default async function WorkshopCustomersPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const { data: customers } = await supabase
    .from('customer_accounts')
    .select('id,name,customer_users(profiles(avatar_url))')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('name');

  return (
    <main className="space-y-4">
      <PageHeader title="Customers" subtitle="All customer accounts linked to your workshop." />
      <Card className="rounded-3xl">
        <div className="space-y-2">
          {(customers ?? []).map((customer) => {
            const avatar = customer.customer_users?.[0]?.profiles?.[0]?.avatar_url;
            return (
              <div key={customer.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-3 hover:bg-stone-50">
                <div className="flex items-center gap-3">
                  {avatar ? <img src={avatar} alt={customer.name} className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">{initials(customer.name)}</div>}
                  <p className="text-sm font-medium text-brand-black">{customer.name}</p>
                </div>
                <Button asChild size="sm" variant="outline"><Link href={`/workshop/customers/${customer.id}`}>Open</Link></Button>
              </div>
            );
          })}
          {!customers?.length ? <p className="py-2 text-sm text-gray-500">No customers yet.</p> : null}
        </div>
      </Card>
    </main>
  );
}
