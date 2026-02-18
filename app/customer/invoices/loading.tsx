export default function CustomerInvoicesLoading() {
  return (
    <main className="space-y-4">
      <div className="h-36 animate-pulse rounded-3xl bg-gradient-to-r from-black via-zinc-900 to-black" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-8 w-20 animate-pulse rounded-full bg-gray-200" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    </main>
  );
}
