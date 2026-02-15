import Link from 'next/link';

export function TopNav() {
  return (
    <header className="border-b bg-black text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <div className="text-xl font-bold">
          <span className="text-white">T</span>
          <span className="text-brand-red">J</span>
          <span className="ml-2 text-sm font-medium">
            <span className="text-brand-red">service</span>{' '}
            <span className="text-white">&</span> <span className="text-gray-300">repairs</span>
          </span>
        </div>
        <nav className="space-x-4 text-sm">
          <Link href="/customer/dashboard">Customer</Link>
          <Link href="/workshop/dashboard">Workshop</Link>
        </nav>
      </div>
    </header>
  );
}
