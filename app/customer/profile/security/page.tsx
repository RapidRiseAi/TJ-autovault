import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/layout/sign-out-button';

export default async function CustomerSecurityPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  return (
    <main className="space-y-4">
      <PageHeader
        title="Security"
        subtitle="Protect your account access and review your login details."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="space-y-3 rounded-3xl p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Login email</p>
          <p className="text-sm font-semibold text-black">{user.email}</p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Use a strong, unique password for this account.</li>
          <li>Do not share OTP codes with anyone.</li>
          <li>Sign out on shared devices after use.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <SignOutButton />
          <Button asChild variant="secondary" size="sm">
            <Link href="/customer/profile/edit">Update email in profile edit</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
