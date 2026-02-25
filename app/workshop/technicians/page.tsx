import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(cents / 100);
}

async function createTechnician(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!actorProfile?.workshop_account_id || actorProfile.role !== 'admin') {
    redirect('/workshop/dashboard');
  }

  const displayName = (formData.get('displayName')?.toString() ?? '').trim();
  const email = (formData.get('email')?.toString() ?? '').trim().toLowerCase();
  const password = (formData.get('password')?.toString() ?? '').trim();

  if (!displayName || !email || password.length < 8) {
    redirect('/workshop/technicians?error=invalid_input');
  }

  const adminSupabase = createAdminClient();
  const { data: created, error: createError } =
    await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        role: 'technician'
      }
    });

  if (createError || !created.user) {
    const duplicate =
      createError?.message?.toLowerCase().includes('already') ?? false;
    redirect(
      `/workshop/technicians?error=${duplicate ? 'email_exists' : 'create_failed'}`
    );
  }

  const { error: profileError } = await adminSupabase.from('profiles').upsert({
    id: created.user.id,
    workshop_account_id: actorProfile.workshop_account_id,
    role: 'technician',
    display_name: displayName
  });

  if (profileError) {
    redirect('/workshop/technicians?error=profile_failed');
  }

  revalidatePath('/workshop/technicians');
  revalidatePath('/workshop/workshop/vehicles');
  redirect('/workshop/technicians?created=1');
}

export default async function WorkshopTechniciansPage({
  searchParams
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  ) {
    redirect('/customer/dashboard');
  }

  const workshopId = profile.workshop_account_id;
  const { data: techniciansRaw } = await supabase
    .from('profiles')
    .select('id,display_name,full_name,created_at')
    .eq('workshop_account_id', workshopId)
    .eq('role', 'technician')
    .order('created_at', { ascending: true });

  const technicians = techniciansRaw ?? [];
  const reportCounts = await Promise.all(
    technicians.map(async (tech) => {
      const { count } = await supabase
        .from('inspection_reports')
        .select('id', { count: 'exact', head: true })
        .eq('workshop_account_id', workshopId)
        .eq('technician_profile_id', tech.id);
      return {
        technicianId: tech.id,
        inspectionReports: count ?? 0
      };
    })
  );

  const reportCountByTechnician = new Map(
    reportCounts.map((item) => [item.technicianId, item.inspectionReports])
  );

  const params = await searchParams;
  const created = params.created === '1';
  const error = params.error;

  return (
    <main className="space-y-4">
      <PageHeader
        title="Technicians"
        subtitle="Add technician logins so they can be selected when uploading inspection reports."
      />

      {created ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Technician added successfully.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === 'invalid_input'
            ? 'Please enter a name, a valid email and a password with at least 8 characters.'
            : error === 'email_exists'
              ? 'That email is already in use. Try another one.'
              : 'Could not create technician right now. Please try again.'}
        </p>
      ) : null}

      {profile.role === 'admin' ? (
        <SectionCard className="rounded-3xl p-6">
          <h2 className="text-base font-semibold text-gray-900">
            Add technician
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            This creates a login account and links it to your workshop.
          </p>
          <form
            action={createTechnician}
            className="mt-4 grid gap-4 md:grid-cols-3"
          >
            <div>
              <label
                htmlFor="displayName"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Name
              </label>
              <input
                id="displayName"
                name="displayName"
                required
                className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                placeholder="Technician name"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                placeholder="tech@workshop.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              >
                Temporary password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit">Create technician</Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard className="rounded-3xl p-6">
        <h2 className="text-base font-semibold text-gray-900">Team</h2>
        <p className="mt-1 text-sm text-gray-600">
          Work summary and wages owed can be expanded later. Current view shows
          inspection report activity.
        </p>

        {technicians.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.13em] text-gray-500">
                  <th className="py-2 pr-4">Technician</th>
                  <th className="py-2 pr-4">Inspection reports</th>
                  <th className="py-2 pr-4">Wages owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {technicians.map((tech) => (
                  <tr key={tech.id}>
                    <td className="py-2 pr-4 font-medium text-gray-900">
                      {tech.display_name ?? tech.full_name ?? 'Technician'}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">
                      {reportCountByTechnician.get(tech.id) ?? 0}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">
                      {formatCurrency(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-600">
            No technicians yet. Add your first technician above.
          </p>
        )}
      </SectionCard>
    </main>
  );
}
