import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
  return <main className="space-y-4"><h1 className="text-2xl font-bold">Workshop profile</h1><Card><form action={updateProfile} className="space-y-3"><div><label className="mb-1 block text-sm font-medium" htmlFor="displayName">Display name</label><input id="displayName" name="displayName" defaultValue={profile?.display_name ?? ''} required className="w-full rounded border p-2" /></div><div><label className="mb-1 block text-sm font-medium" htmlFor="email">Email</label><input id="email" value={user.email ?? ''} readOnly className="w-full rounded border bg-gray-100 p-2 text-gray-600"/></div><button className="rounded bg-brand-red px-4 py-2 text-white" type="submit">Save profile</button></form></Card></main>;
}
