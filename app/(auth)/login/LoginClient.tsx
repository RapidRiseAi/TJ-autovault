'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDashboardPathForRole, type UserRole } from '@/lib/auth/role-redirect';
import { Button } from '@/components/ui/button';

const showOtp = process.env.NEXT_PUBLIC_ENABLE_EMAIL_OTP === 'true';

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');
  const created = searchParams.get('created') === '1';

  async function signIn() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError) {
      setMsg(profileError.message);
      return;
    }

    const dashboardPath = getDashboardPathForRole(profile.role as UserRole);

    if (dashboardPath === '/customer/dashboard') {
      const bootstrapResponse = await fetch('/api/auth/customer/bootstrap', { method: 'POST' });
      if (!bootstrapResponse.ok) {
        router.push('/customer/profile-required');
        return;
      }
    }

    router.push(dashboardPath);
  }

  async function sendOtp() {
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    setMsg(res.ok ? 'OTP email sent.' : 'Failed to send OTP.');
  }

  async function verifyOtp() {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setMsg(error ? error.message : 'Email verified.');
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Login</h1>
      {created ? (
        <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">
          Account created successfully. Please sign in.
        </p>
      ) : null}
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
      <Button onClick={signIn}>Sign in</Button>
      <p className="text-sm text-gray-600">
        New here?{' '}
        <Link href="/signup" className="text-brand-red underline">
          Create account
        </Link>
      </p>
      {showOtp && (
        <div className="rounded border p-3">
          <p className="mb-2 text-sm font-medium">Email OTP verification</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={sendOtp}>
              Send OTP
            </Button>
            <input
              className="flex-1 rounded border p-2"
              placeholder="6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <Button onClick={verifyOtp}>Verify</Button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </main>
  );
}
