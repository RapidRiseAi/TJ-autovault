import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getTemporaryVehicleLimitByTier } from '@/lib/customer/temporary-vehicles';

const GB_IN_BYTES = 1024 * 1024 * 1024;

function formatStorage(bytes: number) {
  if (bytes >= GB_IN_BYTES) return `${(bytes / GB_IN_BYTES).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export default async function CustomerUsagePage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const customerAccountId = customerUser?.customer_account_id;

  const [{ data: account }, { count: vehicleCount }, { data: storageDocs }] = customerAccountId
    ? await Promise.all([
        supabase
          .from('customer_accounts')
          .select('vehicle_limit,included_storage_bytes,extra_storage_gb,tier,temporary_vehicle_limit')
          .eq('id', customerAccountId)
          .maybeSingle(),
        supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('current_customer_account_id', customerAccountId),
        supabase
          .from('vehicle_documents')
          .select('size_bytes')
          .eq('customer_account_id', customerAccountId)
          .limit(5000)
      ])
    : [{ data: null }, { count: 0 }, { data: [] }];

  const { count: activeTemporaryVehicleCount } = customerAccountId
    ? await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('current_customer_account_id', customerAccountId)
        .eq('is_temporary', true)
        .is('archived_at', null)
    : { count: 0 };

  const storageUsedBytes = (storageDocs ?? []).reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0);
  const storageLimitBytes = Number(account?.included_storage_bytes ?? 0) + (Number(account?.extra_storage_gb ?? 0) * GB_IN_BYTES);
  const usagePercent = storageLimitBytes > 0 ? (storageUsedBytes / storageLimitBytes) * 100 : 0;
  const temporaryVehicleLimit = Number(
    account?.temporary_vehicle_limit ?? getTemporaryVehicleLimitByTier(account?.tier)
  );

  return (
    <main className="space-y-4">
      <PageHeader
        title="Usage"
        subtitle="Track your vehicle slots and document storage."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="space-y-3 rounded-3xl p-5">
        <p className="text-sm text-gray-600">Vehicles used</p>
        <p className="text-lg font-semibold">{vehicleCount ?? 0} / {account?.vehicle_limit ?? 1}</p>
        <p className="text-sm text-gray-600">Active temporary vehicles</p>
        <p className="text-lg font-semibold">{activeTemporaryVehicleCount ?? 0} / {temporaryVehicleLimit}</p>
        <p className="text-sm text-gray-600">Storage used</p>
        <p className="text-lg font-semibold">{formatStorage(storageUsedBytes)} / {formatStorage(storageLimitBytes)}</p>
        <p className="text-sm text-gray-600">Usage percentage</p>
        <p className="text-lg font-semibold">{usagePercent.toFixed(1)}%</p>
      </Card>
    </main>
  );
}
