import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center p-6 text-center">
      <h1 className="mb-3 text-4xl font-bold">autovault</h1>
      <p className="mb-8 text-gray-600">
        Mechanic customer portal + workshop operations portal.
      </p>
      <div className="flex gap-4">
        <Link className="rounded bg-brand-red px-4 py-2 font-semibold text-white" href="/login">
          Login
        </Link>
        <Link className="rounded border border-brand-black px-4 py-2" href="/customer/dashboard">
          Customer Demo
        </Link>
      </div>
    </main>
  );
}
