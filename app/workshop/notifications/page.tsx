import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { NotificationsLive } from '@/components/layout/notifications-live';
import { PageHeader } from '@/components/layout/page-header';

export const dynamic = 'force-dynamic';

export default async function WorkshopNotificationsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  return (
    <main className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Alerts from customer activity and workshop workflows."
        actions={<Button asChild variant="secondary"><Link href="/workshop/dashboard">Back to dashboard</Link></Button>}
      />
      <NotificationsLive fullPage />
    </main>
  );
}
