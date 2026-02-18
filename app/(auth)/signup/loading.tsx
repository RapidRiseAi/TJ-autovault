export default function SignupLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-100 to-white px-4 py-8">
      <div className="w-full max-w-2xl space-y-3 rounded-2xl border border-black/10 bg-white p-6">
        <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      </div>
    </main>
  );
}
