export default function CustomerRouteLoading() {
  return (
    <main className="space-y-4 px-4 py-6">
      <div className="h-8 w-72 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-gray-100" />
    </main>
  );
}
