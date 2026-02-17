import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { signupCustomerAction } from '@/lib/actions/auth';

const plans = [
  { key: 'basic', title: 'Basic', label: 'R100 / month', limit: 1 },
  { key: 'pro', title: 'Pro', label: 'R700 / month', limit: 10 },
  { key: 'business', title: 'Business', label: 'R1200 / month', limit: 20 }
] as const;

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Create account</h1>
      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      <form action={signupCustomerAction} className="space-y-4">
        <input name="displayName" className="w-full rounded border p-2" placeholder="Display name" />
        <input name="email" type="email" required className="w-full rounded border p-2" placeholder="Email" />
        <input name="password" type="password" required className="w-full rounded border p-2" placeholder="Password" minLength={6} />

        <div className="grid gap-2">
          {plans.map((item, idx) => (
            <label key={item.key} className="cursor-pointer rounded border p-3">
              <input type="radio" className="mr-2" name="plan" value={item.key} defaultChecked={idx === 0} />
              <span className="font-semibold">{item.title}</span>{' '}
              <span className="text-sm text-gray-600">
                {item.label} · {item.limit} vehicle{item.limit > 1 ? 's' : ''}
              </span>
            </label>
          ))}
        </div>

        <Button type="submit">Sign up</Button>
      </form>
      <p className="text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-red underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
