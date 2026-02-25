import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { InspectionTemplatesTable } from '@/components/workshop/inspection-templates-table';

export default async function InspectionTemplatesPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id,role')
    .eq('id', user.id)
    .in('role', ['admin', 'technician'])
    .maybeSingle();

  if (!profile?.workshop_account_id) {
    redirect('/workshop/dashboard');
  }

  const { data: templates } = await supabase
    .from('inspection_templates')
    .select('id,name,updated_at,inspection_template_fields(id)')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('updated_at', { ascending: false });

  return (
    <main className="space-y-4">
      <PageHeader
        title="Inspection templates"
        subtitle="Build and manage reusable digital inspection forms."
        actions={
          <Button asChild size="sm">
            <Link href="/workshop/settings/inspection-templates/new">Create template</Link>
          </Button>
        }
      />
      <Card>
        <InspectionTemplatesTable templates={templates ?? []} />
      </Card>
    </main>
  );
}
