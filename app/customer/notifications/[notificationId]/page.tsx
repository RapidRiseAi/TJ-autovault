import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerNotificationDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ notificationId: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { notificationId } = await params;
  const { next } = await searchParams;

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: customerAccount } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle();

  if (customerAccount?.id) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('to_customer_account_id', customerAccount.id)
      .is('deleted_at', null);
  }

  redirect(next || '/customer/notifications');
}
