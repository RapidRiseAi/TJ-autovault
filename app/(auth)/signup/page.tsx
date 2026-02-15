'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function signUp() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName
        }
      }
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    if (data.session) {
      router.push('/customer/dashboard');
      return;
    }

    setMsg('Check your email to confirm, then sign in.');
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Create account</h1>
      <input
        className="w-full rounded border p-2"
        placeholder="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full rounded border p-2"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button onClick={signUp}>Sign up</Button>
      <p className="text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-red underline">
          Sign in
        </Link>
      </p>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </main>
  );
}
