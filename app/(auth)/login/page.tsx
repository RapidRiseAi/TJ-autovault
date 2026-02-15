'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : 'Signed in.');
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
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setMsg(error ? error.message : 'Email verified.');
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Login</h1>
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
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </main>
  );
}
