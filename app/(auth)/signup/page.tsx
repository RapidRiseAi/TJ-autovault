import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { signupCustomerAction } from '@/lib/actions/auth';
import { FormSubmitButton } from '@/components/auth/form-submit-button';
import { SignupPlanSelector } from '@/components/auth/signup-plan-selector';
import { AuthShell } from '@/components/auth/auth-shell';

const plans = [
  { key: 'basic', title: 'Basic', popular: false },
  { key: 'pro', title: 'Pro', popular: true },
  { key: 'business', title: 'Business', popular: false }
] as const;

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthShell>
      <Card className="w-full space-y-5 rounded-2xl border border-black/10 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] sm:p-8">
        <h1 className="text-3xl font-semibold text-gray-900">Create account</h1>
        <p className="text-sm text-gray-600">
          Track service history, quotes, invoices and documents.
        </p>

        <div className="min-h-10">
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <form action={signupCustomerAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="display-name" className="text-sm font-medium text-gray-700">
              Display name
            </label>
            <input
              id="display-name"
              name="displayName"
              className="w-full rounded-xl border border-black/15 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="Display name"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-black/15 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="Email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="signup-password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="signup-password"
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-black/15 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="Password"
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone-number" className="text-sm font-medium text-gray-700">
              Phone number (optional)
            </label>
            <input
              id="phone-number"
              name="phone"
              type="tel"
              className="w-full rounded-xl border border-black/15 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="Phone number"
            />
          </div>

          <SignupPlanSelector plans={plans} />

          <FormSubmitButton
            idleLabel="Create account"
            pendingLabel="Creating your account..."
            transitionMessage="Creating your account..."
          />

          <p className="text-xs text-gray-500">
            By continuing you agree to <Link href="#" className="underline-offset-4 hover:underline">Terms</Link> and{' '}
            <Link href="#" className="underline-offset-4 hover:underline">Privacy</Link>
          </p>
        </form>

        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-red underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
