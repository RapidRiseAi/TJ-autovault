'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDashboardPathForRole, type UserRole } from '@/lib/auth/role-redirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const showOtp = process.env.NEXT_PUBLIC_ENABLE_EMAIL_OTP === 'true';

export default function LoginClient({ created = false }: { created?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isOtpPending, setIsOtpPending] = useState(false);

  async function signIn() {
    setIsSigningIn(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      setIsSigningIn(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
    if (profileError) {
      setMsg(profileError.message);
      setIsSigningIn(false);
      return;
    }

    const dashboardPath = getDashboardPathForRole(profile.role as UserRole);
    if (dashboardPath === '/customer/dashboard') {
      const bootstrapResponse = await fetch('/api/auth/customer/bootstrap', { method: 'POST' });
      if (!bootstrapResponse.ok) {
        router.push('/customer/profile-required');
        setIsSigningIn(false);
        return;
      }
    }

    router.push(dashboardPath);
    setIsSigningIn(false);
  }

  async function sendOtp() {
    setIsOtpPending(true);
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    setMsg(res.ok ? 'OTP email sent.' : 'Failed to send OTP.');
    setIsOtpPending(false);
  }

  async function verifyOtp() {
    setIsOtpPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setMsg(error ? error.message : 'Email verified.');
    setIsOtpPending(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-100 to-white px-4">
      <Card className="w-full max-w-md space-y-4 border-black/10">
        <h1 className="text-2xl font-semibold">Login</h1>
        {created ? <p className="rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-800">Account created. Please sign in.</p> : null}
        <input className="w-full rounded-lg border p-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded-lg border p-3" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button onClick={signIn} className="w-full" disabled={isSigningIn}>{isSigningIn ? "Signing in..." : "Sign in"}</Button>
        <p className="text-sm text-gray-600">
          New here? <Link href="/signup" className="font-semibold text-brand-red">Create account</Link>
        </p>

        {showOtp ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Email verification (OTP)</summary>
            <div className="mt-2 space-y-2">
              <Button variant="secondary" onClick={sendOtp} disabled={isOtpPending}>{isOtpPending ? "Sending..." : "Send OTP"}</Button>
              <input className="w-full rounded-lg border p-2" placeholder="OTP code" value={otp} onChange={(e) => setOtp(e.target.value)} />
              <Button variant="secondary" onClick={verifyOtp} disabled={isOtpPending}>{isOtpPending ? "Verifying..." : "Verify OTP"}</Button>
            </div>
          </details>
        ) : null}

        {msg ? <p className="text-sm text-gray-600">{msg}</p> : null}
      </Card>
    </main>
  );
}
