'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function onSignOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={isSigningOut}
      className="rounded border border-white/30 px-3 py-1 text-xs font-medium hover:bg-white/10 disabled:opacity-50"
    >
      {isSigningOut ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
