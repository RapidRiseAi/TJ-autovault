import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownCircle, ArrowLeft, ArrowUpCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, getSaTodayParts, monthEndIso, monthStartIso, requireWorkshopContext } from '@/lib/workshop/management';

type EntryRow = {
  id: string;
  entry_kind: 'income' | 'expense';
  source_type: string;
  category: string | null;
  description: string | null;
  amount_cents: number | string | null;
  occurred_on: string;
  vendor_id: string | null;
};

export default async function WorkshopMonthlyStatementPage() {
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || !ctx.profile.workshop_account_id) redirect('/login');

  const { year, month } = getSaTodayParts();
  const currentMonthStart = monthStartIso(year, month);
  const currentMonthEnd = monthEndIso(year, month);

  const [{ data: entries, error: entriesError }, { data: vendors }, { data: invoices }] = await Promise.all([
    supabase
      .from('workshop_finance_entries')
      .select('id,entry_kind,source_type,category,description,amount_cents,occurred_on,vendor_id')
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .gte('occurred_on', currentMonthStart)
      .lte('occurred_on', currentMonthEnd)
      .order('occurred_on', { ascending: false }),
    supabase
      .from('workshop_vendors')
      .select('id,name')
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
    ,
    supabase
      .from('invoices')
      .select('id,invoice_number,payment_status,total_cents,balance_due_cents,created_at')
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(200)
  ]);

  const vendorNameById = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));
  const rows = (entries ?? []) as EntryRow[];

  const incomeMonth = rows
    .filter((entry) => entry.entry_kind === 'income')
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
  const expenseMonth = rows
    .filter((entry) => entry.entry_kind === 'expense')
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
  const profitMonth = incomeMonth - expenseMonth;
  const unpaidTotal = (invoices ?? [])
    .filter((invoice) => (invoice.payment_status ?? 'unpaid') !== 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.balance_due_cents ?? invoice.total_cents ?? 0), 0);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-gray-500">{currentMonthStart} → {currentMonthEnd}</p>
          <h1 className="text-xl font-semibold text-black">Current month statement</h1>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href="/workshop/management"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
        </Button>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">Total credits: <strong>{formatMoney(incomeMonth)}</strong></p>
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">Total debits: <strong>{formatMoney(expenseMonth)}</strong></p>
        <p className="rounded-xl bg-neutral-100 px-3 py-2 text-neutral-800">Net: <strong>{formatMoney(profitMonth)}</strong></p>
      </div>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Total owed (all unpaid invoices): <strong>{formatMoney(unpaidTotal)}</strong></p>

      <Card className="rounded-3xl border-black/10 p-5">
        {entriesError ? (
          <p className="text-sm text-gray-600">Unable to load statement entries in this environment right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-[0.13em] text-gray-500">
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">Description</th>
                  <th className="py-2">Vendor</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((entry) => (
                  <tr key={entry.id} className="border-b border-black/5">
                    <td className="py-2 text-gray-600">{entry.occurred_on}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${entry.entry_kind === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {entry.entry_kind === 'income' ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                        {entry.entry_kind}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">{entry.source_type.replaceAll('_', ' ')}</td>
                    <td className="py-2 text-gray-700">{entry.description ?? entry.category ?? '—'}</td>
                    <td className="py-2 text-gray-600">{entry.vendor_id ? vendorNameById.get(entry.vendor_id) ?? 'Vendor' : '—'}</td>
                    <td className={`py-2 text-right font-semibold ${entry.entry_kind === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{entry.entry_kind === 'income' ? '+' : '-'}{formatMoney(Number(entry.amount_cents ?? 0))}</td>
                  </tr>
                )) : (
                  <tr>
                    <td className="py-6 text-center text-sm text-gray-500" colSpan={6}>No entries this month yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="rounded-3xl border-black/10 p-5">
        <h2 className="text-base font-semibold text-black">Invoice payment statuses</h2>
        <div className="mt-3 space-y-2">
          {(invoices ?? []).map((invoice) => {
            const paid = (invoice.payment_status ?? '').toLowerCase() === 'paid';
            return (
              <div key={invoice.id} className={`rounded-xl border px-3 py-2 text-sm ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`}</p>
                  <p className="font-semibold">{formatMoney(Number(invoice.total_cents ?? 0))}</p>
                </div>
                <p className="text-xs text-gray-600">Status: {(invoice.payment_status ?? 'unpaid').replace('_', ' ')}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
