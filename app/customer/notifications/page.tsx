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
        actions={<Button asChild variant="secondary" className="w-full sm:w-auto"><Link href={customerDashboard()}>Back to Dashboard</Link></Button>}
      />
      <div className="flex justify-stretch sm:justify-end">
        <Button asChild variant="outline" className="w-full sm:w-auto"><Link href="/settings/notifications">Notification settings</Link></Button>
      </div>
      <NotificationsLive fullPage />
    </main>
  );
}
