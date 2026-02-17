import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; open?: string; next?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  if (params.open) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', params.open);
    redirect(params.next || '/notifications');
  }

  let query = supabase.from('notifications').select('id,title,body,href,is_read,created_at').order('created_at', { ascending: false });
  if (params.filter === 'unread') query = query.eq('is_read', false);
  const { data } = await query;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <div className="flex gap-3 text-sm">
        <Link className="underline" href="/notifications">All</Link>
        <Link className="underline" href="/notifications?filter=unread">Unread</Link>
      </div>
      <div className="space-y-2">
        {(data ?? []).map((item) => (
          <Link key={item.id} className="block rounded border p-3" href={`/notifications?open=${item.id}&next=${encodeURIComponent(item.href)}`}>
            <p className={item.is_read ? 'text-gray-600' : 'font-semibold'}>{item.title}</p>
            {item.body ? <p className="text-sm text-gray-600">{item.body}</p> : null}
            <p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
