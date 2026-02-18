export default function CustomerDashboardLoading() {
  return (
    <main className="space-y-6">
      <div className="h-9 w-56 animate-pulse rounded bg-gray-200" />
      <div className="h-20 animate-pulse rounded-2xl bg-gray-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    </main>
  );
}
