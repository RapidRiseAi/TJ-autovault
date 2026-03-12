import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { NotificationEmailSettingsForm } from '@/components/settings/notification-email-settings-form';
import { getNotificationEmailSettings } from '@/lib/actions/notification-email-settings';

export const dynamic = 'force-dynamic';

export default async function CustomerProfileNotificationSettingsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const initial = await getNotificationEmailSettings();

  return (
    <main className="space-y-4">
      <PageHeader
        title="Notification settings"
        subtitle="Control which updates you receive and where they are sent."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <NotificationEmailSettingsForm initial={initial} />
    </main>
  );
}
