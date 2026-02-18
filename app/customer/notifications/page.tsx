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
