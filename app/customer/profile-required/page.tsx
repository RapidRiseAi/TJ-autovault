import { redirect } from 'next/navigation';
import { createCustomerAccountIfMissing } from '@/lib/actions/customer-vehicles';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerProfileRequiredPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: account } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (account) redirect('/customer/dashboard');

  async function bootstrapAccount() {
    'use server';
    const result = await createCustomerAccountIfMissing();
    if (result.ok) redirect('/customer/dashboard');
    redirect('/customer/profile-required');
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold">Create my customer profile</h1>
      <p className="text-sm text-gray-600">Your login is valid, but your customer profile has not been created yet.</p>
      <form action={bootstrapAccount}>
        <button className="rounded bg-brand-red px-4 py-2 text-white">Create my customer profile</button>
      </form>
    </main>
  );
}
