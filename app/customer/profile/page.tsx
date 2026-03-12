import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { WorkshopSupportTicketButton } from '@/components/layout/workshop-support-ticket-button';

const settingsLinks = [
  { href: '/customer/profile/edit', title: 'Profile edit', description: 'Update your personal details and photo.' },
  { href: '/customer/profile/notifications', title: 'Notification settings', description: 'Choose alerts and delivery channels.' },
  { href: '/customer/profile/subscription', title: 'Subscription', description: 'View your plan tier and status.' },
  { href: '/customer/profile/usage', title: 'Usage', description: 'Track vehicle slots and storage usage.' },
  { href: '/customer/profile/billing', title: 'Billing info', description: 'Review billing contact information.' },
  { href: '/customer/profile/security', title: 'Security', description: 'Review account access and safety tips.' },
  { href: '/customer/profile/support', title: 'Customer support', description: 'Get help from the support team.' },
  { href: '/customer/profile/remove-account', title: 'Remove account', description: 'Remove your customer account access.' }
];

function statusTone(status: string) {
  if (status === 'active' || status === 'paid') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'trialing') return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

export default async function CustomerProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name,full_name,avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const { data: account } = customerUser?.customer_account_id
    ? await supabase
        .from('customer_accounts')
        .select('tier,subscription_status,vehicle_limit')
        .eq('id', customerUser.customer_account_id)
        .maybeSingle()
    : { data: null };

  const planName = account?.tier ?? 'basic';
  const planStatus = account?.subscription_status ?? 'pending';

  return (
    <main className="space-y-5">
      <Card className="rounded-3xl p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <img
            src={profile?.avatar_url || '/favicon.ico'}
            alt="Profile avatar"
            className="h-16 w-16 rounded-2xl border border-black/10 object-cover"
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-black sm:text-2xl">
              {profile?.full_name || profile?.display_name || 'Customer profile'}
            </h1>
            <p className="truncate text-sm text-gray-600">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 capitalize">
                Plan: {planName}
              </span>
              <span className={`rounded-full border px-3 py-1 capitalize ${statusTone(planStatus)}`}>
                Status: {planStatus}
              </span>
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1">
                Vehicle slots: {account?.vehicle_limit ?? 1}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-3xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage your account from one place. Tap any setting to open its page.
        </p>
        <div className="mt-4 grid gap-3">
          {settingsLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-black/10 bg-white p-4 transition hover:-translate-y-px hover:border-black/20 hover:shadow-sm"
            >
              <p className="text-sm font-semibold text-black">{item.title}</p>
              <p className="text-xs text-gray-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl p-5 sm:p-6">
        <h2 className="text-base font-semibold">Quick actions</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WorkshopSupportTicketButton />
          <SignOutButton />
          <Button asChild variant="secondary" size="sm">
            <Link href="/customer/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
