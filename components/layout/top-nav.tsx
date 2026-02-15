import Link from 'next/link';
import { customerDashboard, workshopDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/layout/sign-out-button';

export async function TopNav() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <header className="border-b bg-black text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <div className="text-xl font-bold">
          <span className="text-white">T</span>
          <span className="text-brand-red">J</span>
          <span className="ml-2 text-sm font-medium">
            <span className="text-brand-red">service</span>{' '}
            <span className="text-white">&</span>{' '}
            <span className="text-gray-300">repairs</span>
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href={customerDashboard()}>Customer</Link>
          <Link href={workshopDashboard()}>Workshop</Link>
          {user ? <SignOutButton /> : null}
        </nav>
      </div>
    </header>
  );
}
