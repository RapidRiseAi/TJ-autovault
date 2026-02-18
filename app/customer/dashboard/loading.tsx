export default function CustomerDashboardLoading() {
  return (
    <main className="space-y-4 pb-4">
      <div className="h-40 animate-pulse rounded-3xl bg-gradient-to-r from-black via-zinc-900 to-black" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
      </div>
    </main>
  );
}
