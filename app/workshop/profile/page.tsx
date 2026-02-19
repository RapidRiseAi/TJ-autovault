import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
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
  const { data: profile } = await supabase.from('profiles').select('display_name,full_name,avatar_url,workshop_account_id').eq('id', user.id).maybeSingle();
  const { data: workshop } = profile?.workshop_account_id ? await supabase.from('workshop_accounts').select('name').eq('id', profile.workshop_account_id).maybeSingle() : { data: null };

  return (
    <main className="space-y-4">
      <PageHeader title="Workshop profile" subtitle="Manage your workshop account identity." />
      <SectionCard className="rounded-3xl p-6">
        <form action={updateProfile} className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" defaultValue={profile?.display_name ?? ''} required className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm shadow-[0_3px_12px_rgba(0,0,0,0.04)]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="fullName">Full name</label>
            <input id="fullName" value={profile?.full_name ?? ''} readOnly className="w-full rounded-2xl border border-black/10 bg-gray-50 px-4 py-2.5 text-sm text-gray-600" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="businessName">Business name</label>
            <input id="businessName" value={workshop?.name ?? ''} readOnly className="w-full rounded-2xl border border-black/10 bg-gray-50 px-4 py-2.5 text-sm text-gray-600" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="email">Email</label>
            <input id="email" value={user.email ?? ''} readOnly className="w-full rounded-2xl border border-black/10 bg-gray-50 px-4 py-2.5 text-sm text-gray-600" />
          </div>
          <div className="md:col-span-2"><Button type="submit">Save profile</Button></div>
        </form>
      </SectionCard>
    </main>
  );
}
