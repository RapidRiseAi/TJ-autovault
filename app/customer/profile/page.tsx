import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';

async function updateProfile(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const displayName = (formData.get('displayName')?.toString() ?? '').trim();
  if (!displayName) return;

  await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id);
  revalidatePath('/customer/profile');
}

export default async function CustomerProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();

  return (
    <main className="space-y-4">
      <PageHeader title="Customer profile" subtitle="Manage your account details." />
      <Card>
        <form action={updateProfile} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" defaultValue={profile?.display_name ?? ''} required className="w-full rounded-lg border p-2" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">Email</label>
            <input id="email" value={user.email ?? ''} readOnly className="w-full rounded-lg border bg-gray-100 p-2 text-gray-600" />
            <p className="mt-1 text-xs text-gray-500">Email updates are managed by Supabase Auth settings.</p>
          </div>
          <Button type="submit">Save profile</Button>
        </form>
      </Card>
    </main>
  );
}
