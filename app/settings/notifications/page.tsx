import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { NotificationEmailSettingsForm } from '@/components/settings/notification-email-settings-form';
import { getNotificationEmailSettings } from '@/lib/actions/notification-email-settings';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const initial = await getNotificationEmailSettings();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const backHref = profile?.role === 'admin' || profile?.role === 'technician' ? '/workshop/notifications' : '/customer/notifications';

  return (
    <main className="space-y-4">
      <PageHeader
        title="Notification settings"
        subtitle="Choose which events send email alerts and where to send them."
        actions={<Button asChild variant="secondary"><Link href={backHref}>Back to notifications</Link></Button>}
      />
      <NotificationEmailSettingsForm initial={initial} />
    </main>
  );
}
