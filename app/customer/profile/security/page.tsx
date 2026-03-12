import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/layout/sign-out-button';

async function updatePassword(formData: FormData) {
  'use server';

  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (password.length < 8) {
    return;
  }

  if (password !== confirmPassword) {
    return;
  }

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  await supabase.auth.updateUser({ password });
  revalidatePath('/customer/profile/security');
}

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
      </Card>

      <Card className="rounded-3xl p-5">
        <h2 className="text-base font-semibold text-black">Update password</h2>
        <form action={updatePassword} className="mt-3 space-y-3">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="New password"
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
          <input
            name="confirm_password"
            type="password"
            required
            minLength={8}
            placeholder="Confirm new password"
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm">Update password</Button>
        </form>
      </Card>

      <Card className="rounded-3xl p-5">
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
