import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { signupCustomerAction } from '@/lib/actions/auth';
import { FormSubmitButton } from '@/components/auth/form-submit-button';
import { AuthMarketingPanel } from '@/components/auth/auth-marketing-panel';

const plans = [
  {
    key: 'basic',
    title: 'Basic',
    label: 'R100 / month',
    limit: 1,
    popular: false
  },
  { key: 'pro', title: 'Pro', label: 'R700 / month', limit: 10, popular: true },
  {
    key: 'business',
    title: 'Business',
    label: 'R1200 / month',
    limit: 20,
    popular: false
  }
] as const;

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-100 via-white to-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <AuthMarketingPanel />
        </div>
        <div>
          <Card className="mx-auto w-full max-w-xl space-y-5 rounded-2xl p-6 sm:p-8">
            <h1 className="text-2xl font-semibold">Create account</h1>
            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <form action={signupCustomerAction} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="displayName"
                  className="w-full rounded-xl border border-black/15 p-3"
                  placeholder="Display name"
                />
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-black/15 p-3"
                  placeholder="Email"
                />
              </div>
              <input
                name="password"
                type="password"
                required
                className="w-full rounded-xl border border-black/15 p-3"
                placeholder="Password"
                minLength={6}
              />

              <div className="grid gap-3 md:grid-cols-3">
                {plans.map((item, idx) => (
                  <label
                    key={item.key}
                    className="relative cursor-pointer rounded-2xl border border-black/10 bg-white p-3 transition-all has-[:checked]:border-brand-red has-[:checked]:bg-red-50/40 has-[:checked]:shadow-[0_8px_24px_rgba(220,38,38,0.16)]"
                  >
                    {item.popular ? (
                      <span className="absolute -top-2 right-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                        Most popular
                      </span>
                    ) : null}
                    <input
                      type="radio"
                      className="sr-only"
                      name="plan"
                      value={item.key}
                      defaultChecked={idx === 0}
                    />
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.label}</p>
                    <p className="text-xs text-gray-500">
                      {item.limit} vehicle{item.limit > 1 ? 's' : ''}
                    </p>
                  </label>
                ))}
              </div>

              <div className="rounded-xl border border-black/10 bg-zinc-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  What you get
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>• Timeline history</li>
                  <li>• Document vault</li>
                  <li>• Status updates</li>
                </ul>
              </div>

              <FormSubmitButton
                idleLabel="Sign up"
                pendingLabel="Creating account..."
              />
              <p className="text-xs text-gray-500">
                Cancel anytime. Upgrade or downgrade later.
              </p>
            </form>
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-brand-red">
                Sign in
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
