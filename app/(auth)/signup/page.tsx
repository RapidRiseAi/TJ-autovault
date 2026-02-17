'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { finalizeSignupPlan } from '@/lib/actions/auth';
import { createClient } from '@/lib/supabase/client';

const plans = [
  { key: 'basic', title: 'Basic', label: 'R100 / month', limit: 1 },
  { key: 'pro', title: 'Pro', label: 'R700 / month', limit: 10 },
  { key: 'business', title: 'Business', label: 'R1200 / month', limit: 20 }
] as const;

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<(typeof plans)[number]['key']>('basic');
  const [msg, setMsg] = useState('');

  async function signUp() {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, selected_plan: plan } }
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    const done = await finalizeSignupPlan(plan, displayName);
    if (!done.ok) {
      setMsg(done.error ?? 'Unable to complete signup.');
      return;
    }

    router.push('/customer/dashboard');
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Create account</h1>
      <input className="w-full rounded border p-2" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <input className="w-full rounded border p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="grid gap-2">
        {plans.map((item) => (
          <label key={item.key} className={`cursor-pointer rounded border p-3 ${plan === item.key ? 'border-brand-red' : ''}`}>
            <input type="radio" className="mr-2" name="plan" checked={plan === item.key} onChange={() => setPlan(item.key)} />
            <span className="font-semibold">{item.title}</span> <span className="text-sm text-gray-600">{item.label} · {item.limit} vehicle{item.limit > 1 ? 's' : ''}</span>
          </label>
        ))}
      </div>
      <Button onClick={signUp}>Sign up</Button>
      <p className="text-sm text-gray-600">Already have an account? <Link href="/login" className="text-brand-red underline">Sign in</Link></p>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </main>
  );
}
