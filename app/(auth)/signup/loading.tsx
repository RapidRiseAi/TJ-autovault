import { AuthShell } from '@/components/auth/auth-shell';

export default function SignupLoading() {
  return (
    <AuthShell>
      <div className="w-full space-y-3 rounded-2xl border border-black/10 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] sm:p-8">
        <div className="h-8 w-44 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-gray-100" />
        <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
