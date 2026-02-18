export default function LoginLoading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-100 via-white to-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="h-[360px] animate-pulse rounded-2xl bg-gradient-to-b from-black via-zinc-900 to-black" />
        <div className="w-full max-w-xl space-y-3 rounded-2xl border border-black/10 bg-white p-6">
          <div className="h-7 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </main>
  );
}
