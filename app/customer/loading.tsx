export default function CustomerRouteLoading() {
  return (
    <main className="space-y-4 px-4 py-6">
      <div className="h-36 animate-pulse rounded-3xl bg-gradient-to-r from-black via-zinc-900 to-black" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
    </main>
  );
}
