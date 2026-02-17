import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopCustomersPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');
  const { data: customers } = await supabase.from('customer_accounts').select('id,name').eq('workshop_account_id', profile.workshop_account_id).order('name');
  return <main className="space-y-4"><h1 className="text-2xl font-bold">Customers</h1><Card>{(customers??[]).map((c)=><Link key={c.id} href={`/workshop/customers/${c.id}`} className="block border-b py-2 text-sm last:border-b-0">{c.name}</Link>)}{!customers?.length?<p className="text-sm text-gray-500">No customers yet.</p>:null}</Card></main>;
}
