import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeroHeader } from '@/components/layout/hero-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2
  }).format((cents ?? 0) / 100);
}

function statusTone(status: string | null) {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
}

export default async function CustomerInvoicesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; vehicleId?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = (params.status ?? 'all').toLowerCase();
  const vehicleIdFilter = params.vehicleId ?? '';

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const context = await getCustomerContextOrCreate();
  if (!context) redirect('/customer/profile-required');

  const customerAccountId = context.customer_account.id;

  const [{ data: invoices }, { data: vehicles }, { data: docs }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id,vehicle_id,total_cents,payment_status,due_date,created_at,status')
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model')
      .eq('current_customer_account_id', customerAccountId),
    supabase
      .from('vehicle_documents')
      .select('id,storage_bucket,storage_path,subject,document_type,vehicle_id')
      .eq('customer_account_id', customerAccountId)
      .eq('document_type', 'invoice')
  ]);

  const filtered = (invoices ?? []).filter((invoice) => {
    const statusMatch =
      statusFilter === 'all' ||
      (statusFilter === 'paid' && invoice.payment_status === 'paid') ||
      (statusFilter === 'unpaid' && invoice.payment_status !== 'paid');

    const vehicleMatch = !vehicleIdFilter || invoice.vehicle_id === vehicleIdFilter;

    return statusMatch && vehicleMatch;
  });

  const vehicleMap = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));
  const docMap = new Map<string, { storage_bucket: string | null; storage_path: string | null }>();

  (docs ?? []).forEach((doc) => {
    if (!doc.storage_path || !doc.storage_bucket) return;
    const subject = (doc.subject ?? '').toLowerCase();
    const invoiceHit = (invoices ?? []).find((invoice) =>
      subject.includes(invoice.id.toLowerCase()) && invoice.vehicle_id === doc.vehicle_id
    );
    if (invoiceHit && !docMap.has(invoiceHit.id)) {
      docMap.set(invoiceHit.id, {
        storage_bucket: doc.storage_bucket,
        storage_path: doc.storage_path
      });
    }
  });

  const filterHref = (status: string) => {
    const qs = new URLSearchParams();
    if (status !== 'all') qs.set('status', status);
    if (vehicleIdFilter) qs.set('vehicleId', vehicleIdFilter);
    const query = qs.toString();
    return `/customer/invoices${query ? `?${query}` : ''}`;
  };

  return (
    <main className="space-y-4">
      <HeroHeader
        title="Invoices"
        subtitle="Track payment status, outstanding balance, and downloads."
      />

      <section className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: 'all' },
          { label: 'Unpaid', value: 'unpaid' },
          { label: 'Paid', value: 'paid' }
        ].map((chip) => {
          const active = statusFilter === chip.value;
          return (
            <Link
              key={chip.value}
              href={filterHref(chip.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                active
                  ? 'border-black bg-black text-white'
                  : 'border-black/15 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </section>

      <section className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="rounded-2xl p-4">
            <p className="text-sm text-gray-600">No invoices found for this filter.</p>
          </Card>
        ) : null}
        {filtered.map((invoice) => {
          const vehicle = invoice.vehicle_id ? vehicleMap.get(invoice.vehicle_id) : null;
          const file = docMap.get(invoice.id);
          return (
            <Card
              key={invoice.id}
              className="rounded-2xl border border-black/10 bg-white/95 p-4 shadow-[0_8px_28px_rgba(17,17,17,0.06)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-black">Invoice {invoice.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-600">
                    {invoice.created_at
                      ? new Date(invoice.created_at).toLocaleDateString('en-ZA')
                      : 'Unknown date'}
                    {invoice.due_date ? ` · Due ${invoice.due_date}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {vehicle
                      ? `${vehicle.registration_number} · ${vehicle.make ?? ''} ${vehicle.model ?? ''}`
                      : 'Vehicle unavailable'}
                  </p>
                </div>
                <div className="space-y-2 text-right">
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold uppercase ${statusTone(invoice.payment_status)}`}
                  >
                    {invoice.payment_status ?? invoice.status ?? 'unknown'}
                  </span>
                  <p className="text-lg font-semibold text-black">{formatMoney(invoice.total_cents ?? 0)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/customer/vehicles/${invoice.vehicle_id}`}>Open vehicle</Link>
                </Button>
                {file ? (
                  <Button asChild size="sm" variant="secondary">
                    <a
                      href={`/api/uploads/download?bucket=${encodeURIComponent(file.storage_bucket ?? '')}&path=${encodeURIComponent(file.storage_path ?? '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
