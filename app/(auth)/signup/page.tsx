import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { signupCustomerAction } from '@/lib/actions/auth';
import { FormSubmitButton } from '@/components/auth/form-submit-button';

const plans = [
  { key: 'basic', title: 'Basic', label: 'R100 / month', limit: 1 },
  { key: 'pro', title: 'Pro', label: 'R700 / month', limit: 10 },
  { key: 'business', title: 'Business', label: 'R1200 / month', limit: 20 }
] as const;

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-100 to-white px-4 py-8">
      <Card className="w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Create account</h1>
        {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
        <form action={signupCustomerAction} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input name="displayName" className="w-full rounded-lg border p-3" placeholder="Display name" />
            <input name="email" type="email" required className="w-full rounded-lg border p-3" placeholder="Email" />
          </div>
          <input name="password" type="password" required className="w-full rounded-lg border p-3" placeholder="Password" minLength={6} />

          <div className="grid gap-3 md:grid-cols-3">
            {plans.map((item, idx) => (
              <label key={item.key} className="cursor-pointer rounded-xl border p-3 transition-colors has-[:checked]:border-brand-red has-[:checked]:bg-red-50">
                <input type="radio" className="sr-only" name="plan" value={item.key} defaultChecked={idx === 0} />
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-gray-600">{item.label}</p>
                <p className="text-xs text-gray-500">{item.limit} vehicle{item.limit > 1 ? 's' : ''}</p>
              </label>
            ))}
          </div>

          <FormSubmitButton idleLabel="Sign up" pendingLabel="Creating account..." />
        </form>
        <p className="text-sm text-gray-600">Already have an account? <Link href="/login" className="font-semibold text-brand-red">Sign in</Link></p>
      </Card>
    </main>
  );
}
