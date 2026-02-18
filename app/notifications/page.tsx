import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { NotificationsLive } from '@/components/layout/notifications-live';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ open?: string; next?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  if (params.open) {
    const [{ data: profile }, { data: customerAccount }] = await Promise.all([
      supabase.from('profiles').select('id').eq('id', user.id).maybeSingle(),
      supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle()
    ]);

    if (profile?.id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', params.open).eq('to_profile_id', profile.id);
    }
    if (customerAccount?.id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', params.open).eq('to_customer_account_id', customerAccount.id);
    }

    redirect(params.next || '/notifications');
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Button asChild variant="outline">
          <Link href={customerDashboard()}>Back to Dashboard</Link>
        </Button>
      </div>
      <div className="flex gap-3 text-sm"><Link className="underline" href="/notifications">Live feed</Link></div>
      <NotificationsLive fullPage />
    </main>
  );
}
