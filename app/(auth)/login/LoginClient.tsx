'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getDashboardPathForRole,
  type UserRole
} from '@/lib/auth/role-redirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AuthShell } from '@/components/auth/auth-shell';

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
  const [isOtpPending, setIsOtpPending] = useState(false);

  function startAuthTransition(message: string) {
    window.dispatchEvent(
      new CustomEvent('auth-transition:start', {
        detail: { message }
      })
    );
  }

  function endAuthTransition() {
    window.dispatchEvent(new Event('auth-transition:end'));
  }

  async function signIn() {
    setMsg('');
    setIsSigningIn(true);
    startAuthTransition('Signing you in...');

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMsg(error.message);
      setIsSigningIn(false);
      endAuthTransition();
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
      endAuthTransition();
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
    <AuthShell>
      <Card className="w-full space-y-4 rounded-2xl border border-black/10 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] sm:p-8">
        <h1 className="text-3xl font-semibold text-gray-900">Welcome back</h1>
        <p className="text-sm text-gray-600">
          Sign in to manage quotes, invoices and service updates.
        </p>
        {created ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
            Account created. Please sign in.
          </p>
        ) : null}

        <div className="space-y-3">
          <label htmlFor="login-email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="login-email"
            className="w-full rounded-xl border border-black/15 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="login-password"
            className="w-full rounded-xl border border-black/15 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          onClick={signIn}
          className="h-11 w-full active:scale-[0.98]"
          disabled={isSigningIn}
        >
          {isSigningIn ? 'Signing you in...' : 'Sign in'}
        </Button>

        <div className="flex items-center justify-between text-sm text-gray-600">
          <Link href="#" className="underline-offset-4 hover:underline">
            Forgot password
          </Link>
          <Link href="/signup" className="font-semibold text-brand-red underline-offset-4 hover:underline">
            Create account
          </Link>
        </div>

        {showOtp ? (
          <details className="rounded-xl border border-black/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Email verification (OTP)
            </summary>
            <div className="mt-2 space-y-2">
              <Button variant="secondary" onClick={sendOtp} disabled={isOtpPending}>
                {isOtpPending ? 'Sending...' : 'Send OTP'}
              </Button>
              <input
                className="w-full rounded-lg border p-2"
                placeholder="OTP code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <Button variant="secondary" onClick={verifyOtp} disabled={isOtpPending}>
                {isOtpPending ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </div>
          </details>
        ) : null}

        <div className="min-h-5 text-sm text-red-700" aria-live="polite">
          {msg}
        </div>

        <p className="text-xs text-gray-500">
          By continuing you agree to <Link href="#" className="underline-offset-4 hover:underline">Terms</Link> and{' '}
          <Link href="#" className="underline-offset-4 hover:underline">Privacy</Link>
        </p>
      </Card>
    </AuthShell>
  );
}
