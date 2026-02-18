export default function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-100 to-white px-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-black/10 bg-white p-6">
        <div className="h-7 w-24 animate-pulse rounded bg-gray-200" />
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
      </div>
    </main>
  );
}
