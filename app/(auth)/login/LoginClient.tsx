'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getDashboardPathForRole,
  type UserRole
} from '@/lib/auth/role-redirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AuthMarketingPanel } from '@/components/auth/auth-marketing-panel';

const showOtp = process.env.NEXT_PUBLIC_ENABLE_EMAIL_OTP === 'true';

export default function LoginClient({
  created = false
}: {
  created?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showSlowOverlay, setShowSlowOverlay] = useState(false);
  const [isOtpPending, setIsOtpPending] = useState(false);

  useEffect(() => {
    if (!isSigningIn) {
      setShowSlowOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowOverlay(true), 300);
    return () => window.clearTimeout(timer);
  }, [isSigningIn]);

  async function signIn() {
    setMsg('');
    setIsSigningIn(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      setMsg(error.message);
      setIsSigningIn(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
    if (profileError) {
      setMsg(profileError.message);
      setIsSigningIn(false);
      return;
    }

    const dashboardPath = getDashboardPathForRole(profile.role as UserRole);
    if (dashboardPath === '/customer/dashboard') {
      const bootstrapResponse = await fetch('/api/auth/customer/bootstrap', {
        method: 'POST'
      });
      if (!bootstrapResponse.ok) {
        window.dispatchEvent(new Event('route-progress:start'));
        router.push('/customer/profile-required');
        return;
      }
    }

    window.dispatchEvent(new Event('route-progress:start'));
    router.push(dashboardPath);
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
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email'
    });
    setMsg(error ? error.message : 'Email verified.');
    setIsOtpPending(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-100 via-white to-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="order-2 lg:order-1">
          <AuthMarketingPanel compact />
        </div>
        <div className="order-1 lg:order-2">
          <Card className="mx-auto w-full max-w-xl space-y-4 rounded-2xl p-6 sm:p-8">
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="text-sm text-gray-600">
              Sign in to manage quotes, invoices and service updates.
            </p>
            {created ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
                Account created. Please sign in.
              </p>
            ) : null}
            <input
              className="w-full rounded-xl border border-black/15 p-3"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-black/15 p-3"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button onClick={signIn} className="w-full" disabled={isSigningIn}>
              {isSigningIn ? 'Signing in...' : 'Sign in'}
            </Button>
            <p className="text-sm text-gray-600">
              New here?{' '}
              <Link href="/signup" className="font-semibold text-brand-red">
                Create account
              </Link>
            </p>

            {showOtp ? (
              <details className="rounded-xl border border-black/10 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Email verification (OTP)
                </summary>
                <div className="mt-2 space-y-2">
                  <Button
                    variant="secondary"
                    onClick={sendOtp}
                    disabled={isOtpPending}
                  >
                    {isOtpPending ? 'Sending...' : 'Send OTP'}
                  </Button>
                  <input
                    className="w-full rounded-lg border p-2"
                    placeholder="OTP code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={verifyOtp}
                    disabled={isOtpPending}
                  >
                    {isOtpPending ? 'Verifying...' : 'Verify OTP'}
                  </Button>
                </div>
              </details>
            ) : null}

            {msg ? <p className="text-sm text-gray-600">{msg}</p> : null}
          </Card>
        </div>
      </div>

      {showSlowOverlay ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-lg">
            Taking you to your dashboard...
          </div>
        </div>
      ) : null}
    </main>
  );
}
