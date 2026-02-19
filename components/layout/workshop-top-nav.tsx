import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/layout/sign-out-button';

function initialsFromName(name?: string | null) {
  if (!name) return 'W';
  const initials = name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return initials || 'W';
}

export async function WorkshopTopNav() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name,full_name,avatar_url,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  const { data: workshopAccount } = profile?.workshop_account_id
    ? await supabase.from('workshop_accounts').select('name').eq('id', profile.workshop_account_id).maybeSingle()
    : { data: null };

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .is('deleted_at', null)
    .eq('to_profile_id', user.id);

  const displayName = profile?.full_name || profile?.display_name || user.email || 'Workshop user';
  const businessName = workshopAccount?.name || 'Workshop';

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/workshop/dashboard" className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-black sm:text-base">
          TJ service & repairs
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/workshop/notifications" className="inline-flex items-center gap-1 rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold text-brand-black hover:bg-gray-100 sm:text-sm">
            <Bell className="h-4 w-4" />
            {count && count > 0 ? <span>{count}</span> : null}
          </Link>
          <Link href="/workshop/profile" className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1 hover:bg-gray-50">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Workshop avatar" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
                {initialsFromName(displayName)}
              </div>
            )}
            <div className="pr-2 text-left">
              <p className="text-xs font-semibold leading-tight text-black">team</p>
              <p className="text-[11px] leading-tight text-gray-500">{businessName}</p>
            </div>
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
