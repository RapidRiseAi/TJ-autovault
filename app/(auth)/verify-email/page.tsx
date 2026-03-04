import Link from 'next/link';
import { AuthShell } from '@/components/layout/auth-shell';
import { Card } from '@/components/ui/card';
import { VerifyEmailOtpCard } from '@/components/auth/verify-email-otp-card';

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;

  return (
    <AuthShell>
      <Card className="w-full space-y-4 rounded-3xl border border-black/10 bg-white p-6 sm:p-10">
        <h1 className="text-2xl font-bold text-gray-900">Verify your email</h1>
        <p className="text-sm text-gray-700">Enter the OTP sent to your email to finish account verification.</p>
        <VerifyEmailOtpCard initialEmail={email ?? ''} />
        <p className="text-sm text-gray-700">
          Already verified? <Link href="/login" className="font-semibold text-brand-red">Sign in</Link>
        </p>
      </Card>
    </AuthShell>
  );
}
