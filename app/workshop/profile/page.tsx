import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

async function updateProfile(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const displayName = (formData.get('displayName')?.toString() ?? '').trim();
  if (!displayName) return;
  await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id);
  revalidatePath('/workshop/profile');
}

export default async function WorkshopProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();

  return (
    <main className="space-y-4">
      <PageHeader title="Workshop profile" subtitle="Manage your workshop account identity." />
      <Card>
        <form action={updateProfile} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" defaultValue={profile?.display_name ?? ''} required className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">Email</label>
            <input id="email" value={user.email ?? ''} readOnly className="w-full rounded-xl border border-black/10 bg-gray-100 px-3 py-2 text-sm text-gray-600" />
          </div>
          <Button type="submit" size="sm">Save profile</Button>
        </form>
      </Card>
    </main>
  );
}
