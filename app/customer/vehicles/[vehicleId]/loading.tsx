export default function VehicleRouteLoading() {
  return (
    <main className="space-y-4">
      <div className="h-40 animate-pulse rounded-3xl bg-gradient-to-r from-black via-zinc-900 to-black" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-28 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-black/10 bg-gray-100" />
    </main>
  );
}
