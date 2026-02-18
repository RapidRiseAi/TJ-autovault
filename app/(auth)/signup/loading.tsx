export default function SignupLoading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-100 via-white to-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="h-[420px] animate-pulse rounded-2xl bg-gradient-to-b from-black via-zinc-900 to-black" />
        <div className="w-full max-w-xl space-y-3 rounded-2xl border border-black/10 bg-white p-6">
          <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
          </div>
          <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
