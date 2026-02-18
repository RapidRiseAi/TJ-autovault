import { AuthShell } from '@/components/auth/auth-shell';

export default function LoginLoading() {
  return (
    <AuthShell>
      <div className="w-full space-y-3 rounded-2xl border border-black/10 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] sm:p-8">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
        <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-11 animate-pulse rounded-xl bg-gray-200" />
      </div>
    </AuthShell>
  );
}
