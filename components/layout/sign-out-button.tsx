'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

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
    <Button type="button" onClick={onSignOut} disabled={isSigningOut} variant="ghost" size="sm" className="rounded-full border border-black/15">
      {isSigningOut ? 'Signing out...' : 'Sign out'}
    </Button>
  );
}
