import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { NotificationsLive } from '@/components/layout/notifications-live';
import { PageHeader } from '@/components/layout/page-header';

export const dynamic = 'force-dynamic';

export default async function CustomerNotificationsPage({ searchParams }: { searchParams: Promise<{ open?: string; next?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  if (params.open) {
    const { data: customerAccount } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (customerAccount?.id) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', params.open).eq('to_customer_account_id', customerAccount.id);
    }
    redirect(params.next || '/customer/notifications');
  }

  return (
    <main className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Alerts from workshop activity and account updates."
        actions={<Button asChild variant="secondary"><Link href={customerDashboard()}>Back to Dashboard</Link></Button>}
      />
      <NotificationsLive fullPage />
    </main>
  );
}
