'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export function VerifyEmailOtpCard({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const sendOtp = async () => {
    setPending(true);
    setMessage('');
    const response = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setMessage(json.error || 'Failed to send OTP.');
    } else {
      setMessage('OTP sent. Check your inbox.');
    }
    setPending(false);
  };

  const verifyOtp = async () => {
    setPending(true);
    setMessage('');

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email'
    });

    if (error) {
      setMessage(error.message);
      setPending(false);
      return;
    }

    setMessage('Email verified. Redirecting to login...');
    setPending(false);
    router.push('/login?verified=1');
  };

  return (
    <div className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full rounded-xl border border-black/15 p-3 text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={sendOtp} disabled={pending || !email}>
          Send OTP
        </Button>
      </div>
      <input
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        placeholder="OTP code"
        className="w-full rounded-xl border border-black/15 p-3 text-sm"
      />
      <Button type="button" onClick={verifyOtp} disabled={pending || !email || !otp}>
        {pending ? 'Verifying…' : 'Verify email'}
      </Button>
      {message ? <p className="text-sm text-gray-700">{message}</p> : null}
    </div>
  );
}
