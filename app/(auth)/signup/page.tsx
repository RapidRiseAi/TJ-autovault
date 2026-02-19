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
      <Card className="relative w-full space-y-5 overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-b from-white to-zinc-50/90 p-6 shadow-[0_34px_90px_rgba(15,23,42,0.22)] sm:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-brand-red" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Create your portal access</p>
        <h1 className="text-3xl font-bold text-gray-900 sm:text-[2rem]">Create account</h1>
        <p className="text-sm text-gray-700">
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
              className="w-full rounded-xl border border-black/15 bg-white/95 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
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
              className="w-full rounded-xl border border-black/15 bg-white/95 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
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
              className="w-full rounded-xl border border-black/15 bg-white/95 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
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
              className="w-full rounded-xl border border-black/15 bg-white/95 p-3 text-base transition focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="Phone number"
            />
          </div>

          <SignupPlanSelector plans={plans} />
          <p className="text-xs font-medium text-gray-500">Choose a plan. You can upgrade anytime.</p>

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

        <p className="text-sm text-gray-700">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-red underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
