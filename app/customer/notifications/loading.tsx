export default function NotificationsLoading() {
  return (
    <main className="space-y-4">
      <div className="h-8 w-52 animate-pulse rounded bg-gray-200" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
    </main>
  );
}
