import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { NotificationsLive } from '@/components/layout/notifications-live';
import { PageHeader } from '@/components/layout/page-header';

export const dynamic = 'force-dynamic';

export default async function CustomerNotificationsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: customerAccount } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle();

  let unreadCount = 0;

  if (customerAccount?.id) {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('to_customer_account_id', customerAccount.id)
      .eq('is_read', false);

    unreadCount = count ?? 0;

    if (unreadCount > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('to_customer_account_id', customerAccount.id)
        .eq('is_read', false);
    }
  }

  return (
    <main className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `Marked ${unreadCount} notification${unreadCount > 1 ? 's' : ''} as read.` : 'Alerts from workshop activity and account updates.'}
        actions={<Button asChild variant="secondary"><Link href={customerDashboard()}>Back to Dashboard</Link></Button>}
      />
      <NotificationsLive fullPage />
    </main>
  );
}
