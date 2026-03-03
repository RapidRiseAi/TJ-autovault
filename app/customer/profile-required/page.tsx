import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerProfileRequiredPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: account } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (account) redirect('/customer/dashboard');

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold">Account not linked yet</h1>
      <p className="text-sm text-gray-600">
        Your login is active, but this email is not linked to a workshop customer
        record yet. Ask your workshop to add or update your linked email. Once
        they do, sign in again and your vehicle history will appear automatically.
      </p>
    </main>
  );
}
