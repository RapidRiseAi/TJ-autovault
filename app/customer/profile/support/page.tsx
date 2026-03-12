import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorkshopSupportTicketButton } from '@/components/layout/workshop-support-ticket-button';

export default async function CustomerSupportPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  return (
    <main className="space-y-4">
      <PageHeader
        title="Customer support"
        subtitle="Need help? Open a support ticket from here."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="space-y-4 rounded-3xl p-5">
        <p className="text-sm text-gray-600">
          Use the support action below to send your request directly to the support team.
        </p>
        <WorkshopSupportTicketButton />
        <p className="text-xs text-gray-500">
          You can also visit the <Link className="underline" href="/help">Help page</Link> for common answers.
        </p>
      </Card>
    </main>
  );
}
