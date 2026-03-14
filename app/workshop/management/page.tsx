import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, Building2, ChartColumn, Coins, HandCoins, PlusCircle, Repeat, TrendingUp, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentRing } from '@/components/ui/segment-ring';
import { OneTimeUploadModal } from '@/components/workshop/one-time-upload-modal';
import {
  addMonths,
  ensureStatementArchivesUpToLastMonth,
  formatMoney,
  getSaTodayParts,
  materializeRecurringExpensesForWorkshop,
  monthEndIso,
  monthStartIso,
  parseMoneyInputToCents,
  requireWorkshopContext
} from '@/lib/workshop/management';

type OneTimeUploadActionState = {
  status: 'idle' | 'error';
  message?: string;
};

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return error.code === '42703' || error.code === 'PGRST204' || message.includes('column') || message.includes('does not exist');
}

async function createUnlinkedUploadCase(_prevState: OneTimeUploadActionState, formData: FormData): Promise<OneTimeUploadActionState> {
  'use server';
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || !ctx.profile.workshop_account_id) return { status: 'error', message: 'Unauthorized' };

  const customerName = (formData.get('customerName')?.toString() ?? '').trim();
  const uploadType = (formData.get('uploadType')?.toString() ?? 'quote').trim();
  if (!customerName) return { status: 'error', message: 'Customer name is required.' };

  const oneTimeAccountName = '__ONE_TIME_CLIENT__';
  let oneTimeCustomerId: string | null = null;

  const existingOneTimeCustomer = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .eq('name', oneTimeAccountName)
    .limit(1)
    .maybeSingle();

  if (existingOneTimeCustomer.data?.id) {
    oneTimeCustomerId = existingOneTimeCustomer.data.id;
  } else {
    const inserted = await supabase
      .from('customer_accounts')
      .insert({
        workshop_account_id: ctx.profile.workshop_account_id,
        name: oneTimeAccountName,
        onboarding_status: 'system_hidden'
      })
      .select('id')
      .single();

    const fallbackInserted =
      inserted.error && isMissingColumnError(inserted.error)
        ? await supabase
            .from('customer_accounts')
            .insert({
              workshop_account_id: ctx.profile.workshop_account_id,
              name: oneTimeAccountName
            })
            .select('id')
            .single()
        : inserted;

    oneTimeCustomerId = fallbackInserted.data?.id ?? null;
  }

  if (!oneTimeCustomerId) {
    return { status: 'error', message: 'Could not initialize one-time client profile.' };
  }

  const oneTimeRegistration = `ONE-TIME-${ctx.profile.workshop_account_id.slice(0, 6).toUpperCase()}`;
  const existingOneTimeVehicle = await supabase
    .from('vehicles')
    .select('id')
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .eq('registration_number', oneTimeRegistration)
    .limit(1)
    .maybeSingle();

  const oneTimeVehicleId = existingOneTimeVehicle.data?.id ?? (
    await supabase
      .from('vehicles')
      .insert({
        workshop_account_id: ctx.profile.workshop_account_id,
        registration_number: oneTimeRegistration,
        make: 'One-time',
        model: 'Client',
        current_customer_account_id: oneTimeCustomerId,
        created_by: ctx.profile.id
      })
      .select('id')
      .single()
  ).data?.id;

  if (!oneTimeVehicleId) {
    return { status: 'error', message: 'Could not initialize one-time client vehicle.' };
  }

  const safeUploadType =
    uploadType === 'invoice' || uploadType === 'inspection_report'
      ? uploadType
      : 'quote';

  const params = new URLSearchParams({
    upload: safeUploadType,
    oneTime: '1',
    oneTimeName: customerName,
    oneTimeNotificationEmail: (formData.get('notificationEmail')?.toString() ?? '').trim(),
    oneTimeBillingName: (formData.get('billingName')?.toString() ?? '').trim(),
    oneTimeBillingCompany: (formData.get('billingCompany')?.toString() ?? '').trim(),
    oneTimeBillingEmail: (formData.get('billingEmail')?.toString() ?? '').trim(),
    oneTimeBillingPhone: (formData.get('billingPhone')?.toString() ?? '').trim(),
    oneTimeBillingAddress: (formData.get('billingAddress')?.toString() ?? '').trim(),
    oneTimeReg: (formData.get('registrationNumber')?.toString() ?? '').trim(),
    oneTimeMake: (formData.get('make')?.toString() ?? '').trim(),
    oneTimeModel: (formData.get('model')?.toString() ?? '').trim(),
    oneTimeVin: (formData.get('vin')?.toString() ?? '').trim()
  });

  redirect(`/workshop/vehicles/${oneTimeVehicleId}?${params.toString()}`);
  return { status: 'idle' };
}

type EntryRow = {
  id: string;
  entry_kind: 'income' | 'expense';
  source_type: string;
  category: string | null;
  description: string | null;
  amount_cents: number | string | null;
  occurred_on: string;
  vendor_id: string | null;
  metadata: Record<string, unknown> | null;
};

type MonthPoint = {
  monthKey: string;
  label: string;
  income: number;
  expenses: number;
  profit: number;
  customers: number;
};

function monthKey(dateIso: string) {
  return dateIso.slice(0, 7);
}

function prettyMonthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-ZA', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
  });
}

function TrendBars({
  title,
  rows,
  keyName,
  colorClass
}: {
  title: string;
  rows: MonthPoint[];
  keyName: 'income' | 'expenses' | 'profit' | 'customers';
  colorClass: string;
}) {
  const rowsWithData = rows.filter((row) => Math.max(0, row[keyName]) > 0);
  const visibleRows = rowsWithData.length ? rowsWithData : rows.slice(-1);
  const values = visibleRows.map((row) => Math.max(0, row[keyName]));
  const max = Math.max(...values, 1);
  const compact = (num: number, maxDecimals: number) => num.toFixed(maxDecimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

  const formatValue = (value: number) => {
    const normalized = Math.max(0, Math.floor(value));

    if (keyName === 'customers') {
      if (normalized >= 1_000_000) return `${compact(normalized / 1_000_000, 3)}M`;
      if (normalized >= 1_000) return `${compact(normalized / 1_000, 2)}K`;
      return `${normalized}`;
    }

    const randValue = normalized / 100;
    if (randValue >= 1_000_000) return `R ${compact(randValue / 1_000_000, 3)}M`;
    if (randValue >= 1_000) return `R ${compact(randValue / 1_000, 2)}K`;
    return `R ${Math.floor(randValue)}`;
  };

  return (
    <Card className="rounded-3xl border-black/10 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</p>
      <div className="mt-4 flex items-end gap-2">
        {visibleRows.map((row) => {
          const value = Math.max(0, row[keyName]);
          const height = value === 0 ? 0 : Math.max(10, Math.round((value / max) * 128));
          return (
            <div key={`${title}-${row.monthKey}`} className="min-w-0 flex-1 space-y-2 text-center">
              <div className="mx-auto flex h-36 items-end justify-center">
                <div className={`relative w-full max-w-9 rounded-t-md ${colorClass}`} style={{ height }} title={`${row.label}: ${formatValue(value)}`}>
                  {value > 0 ? (
                    <span className="pointer-events-none absolute bottom-1.5 left-1/2 translate-x-1.5 md:translate-x-2">
                      <span
                        className="block whitespace-nowrap text-[12px] font-semibold leading-none text-white md:text-[24px]"
                        style={{
                          transform: 'rotate(-90deg)',
                          transformOrigin: 'left bottom',
                          textShadow: '-0.6px 0 #111, 0 0.6px #111, 0.6px 0 #111, 0 -0.6px #111'
                        }}
                      >
                        {formatValue(value)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="text-[10px] text-gray-500">{row.label}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

async function setMonthlyTarget(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || ctx.profile.role !== 'admin') return;

  const { year, month } = getSaTodayParts();
  const targetCents = parseMoneyInputToCents(
    formData.get('targetAmount')?.toString() ?? '0'
  );

  await supabase.from('workshop_finance_targets').upsert(
    {
      workshop_account_id: ctx.profile.workshop_account_id,
      month_start: monthStartIso(year, month),
      income_target_cents: targetCents,
      created_by: ctx.profile.id
    },
    { onConflict: 'workshop_account_id,month_start' }
  );

  revalidatePath('/workshop/management');
  revalidatePath('/workshop/dashboard');
}

async function addVendor(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || ctx.profile.role !== 'admin') return;

  const name = (formData.get('vendorName')?.toString() ?? '').trim();
  if (!name) return;

  await supabase.from('workshop_vendors').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    name,
    email: (formData.get('vendorEmail')?.toString() ?? '').trim() || null,
    phone: (formData.get('vendorPhone')?.toString() ?? '').trim() || null,
    contact_person: (formData.get('contactPerson')?.toString() ?? '').trim() || null,
    notes: (formData.get('vendorNotes')?.toString() ?? '').trim() || null,
    created_by: ctx.profile.id
  });

  revalidatePath('/workshop/management');
}

async function addManualEntry(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || ctx.profile.role !== 'admin') return;

  const entryKind = (formData.get('entryKind')?.toString() ?? 'expense') as 'income' | 'expense';
  const amountCents = parseMoneyInputToCents(formData.get('amount')?.toString() ?? '0');
  if (amountCents <= 0) return;

  const occurredOn = (formData.get('occurredOn')?.toString() ?? '').trim();
  const { year, month, day } = getSaTodayParts();
  const fallbackDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  await supabase.from('workshop_finance_entries').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    entry_kind: entryKind,
    source_type: entryKind === 'income' ? 'manual_income' : 'manual_expense',
    category: (formData.get('category')?.toString() ?? '').trim() || null,
    description: (formData.get('description')?.toString() ?? '').trim() || null,
    amount_cents: amountCents,
    occurred_on: occurredOn || fallbackDate,
    vendor_id: (formData.get('vendorId')?.toString() ?? '').trim() || null,
    created_by: ctx.profile.id
  });

  revalidatePath('/workshop/management');
  revalidatePath('/workshop/dashboard');
}

async function addRecurringExpense(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || ctx.profile.role !== 'admin') return;

  const title = (formData.get('title')?.toString() ?? '').trim();
  const amountCents = parseMoneyInputToCents(formData.get('amount')?.toString() ?? '0');
  if (!title || amountCents <= 0) return;

  const cadence = (formData.get('cadence')?.toString() ?? 'monthly').trim();
  const nextRunOn = (formData.get('nextRunOn')?.toString() ?? '').trim();
  const { year, month, day } = getSaTodayParts();

  await supabase.from('workshop_recurring_expenses').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    vendor_id: (formData.get('vendorId')?.toString() ?? '').trim() || null,
    title,
    amount_cents: amountCents,
    category: (formData.get('category')?.toString() ?? '').trim() || 'overhead',
    cadence: cadence === 'weekly' ? 'weekly' : 'monthly',
    next_run_on:
      nextRunOn ||
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    notes: (formData.get('notes')?.toString() ?? '').trim() || null,
    created_by: ctx.profile.id
  });

  revalidatePath('/workshop/management');
}

export default async function WorkshopManagementPage() {
  const supabase = await createClient();
  const ctx = await requireWorkshopContext(supabase);
  if (!ctx || !ctx.profile.workshop_account_id) redirect('/login');
  if (ctx.profile.role !== 'admin' && ctx.profile.role !== 'technician') {
    redirect('/customer/dashboard');
  }

  const workshopId = ctx.profile.workshop_account_id;

  if (ctx.profile.role === 'admin') {
    await materializeRecurringExpensesForWorkshop(supabase, workshopId, ctx.profile.id);
    await ensureStatementArchivesUpToLastMonth(supabase, workshopId);
  }

  const { year, month } = getSaTodayParts();
  const currentMonthStart = monthStartIso(year, month);
  const currentMonthEnd = monthEndIso(year, month);
  const twelveMonthsAgo = addMonths(year, month, -11);
  const trendStart = monthStartIso(twelveMonthsAgo.year, twelveMonthsAgo.month);

  const [
    { data: workshop },
    { data: targetRow, error: targetError },
    { data: currentEntries, error: currentEntriesError },
    { data: yearlyEntries, error: yearlyEntriesError },
    { data: vendors, error: vendorsError },
    { data: recurring, error: recurringError },
    { data: statementArchives, error: statementArchivesError },
    { data: customerRows },
    { data: currentPaidInvoices },
    { data: currentPayouts },
    { data: yearlyPaidInvoices },
    { data: yearlyPayouts }
  ] = await Promise.all([
    supabase
      .from('workshop_accounts')
      .select('name')
      .eq('id', workshopId)
      .maybeSingle(),
    supabase
      .from('workshop_finance_targets')
      .select('income_target_cents')
      .eq('workshop_account_id', workshopId)
      .eq('month_start', currentMonthStart)
      .maybeSingle(),
    supabase
      .from('workshop_finance_entries')
      .select('id,entry_kind,source_type,category,description,amount_cents,occurred_on,vendor_id,metadata')
      .eq('workshop_account_id', workshopId)
      .gte('occurred_on', currentMonthStart)
      .lte('occurred_on', currentMonthEnd)
      .order('occurred_on', { ascending: false }),
    supabase
      .from('workshop_finance_entries')
      .select('entry_kind,source_type,amount_cents,occurred_on')
      .eq('workshop_account_id', workshopId)
      .gte('occurred_on', trendStart)
      .lte('occurred_on', currentMonthEnd),
    supabase
      .from('workshop_vendors')
      .select('id,name,email,phone,contact_person,notes,created_at')
      .eq('workshop_account_id', workshopId)
      .order('name', { ascending: true }),
    supabase
      .from('workshop_recurring_expenses')
      .select('id,title,amount_cents,cadence,next_run_on,category,vendor_id,is_active')
      .eq('workshop_account_id', workshopId)
      .order('next_run_on', { ascending: true }),
    supabase
      .from('workshop_monthly_statement_archives')
      .select('id,month_start,month_end,totals,created_at,pdf_storage_path,pdf_generated_at')
      .eq('workshop_account_id', workshopId)
      .order('month_start', { ascending: false })
      .limit(12),
    supabase
      .from('customer_accounts')
      .select('id,created_at')
      .eq('workshop_account_id', workshopId)
      .gte('created_at', `${trendStart}T00:00:00.000Z`),
    supabase
      .from('invoices')
      .select('id,total_cents,updated_at,invoice_number')
      .eq('workshop_account_id', workshopId)
      .eq('payment_status', 'paid')
      .gte('updated_at', `${currentMonthStart}T00:00:00.000Z`)
      .lte('updated_at', `${currentMonthEnd}T23:59:59.999Z`),
    supabase
      .from('technician_payouts')
      .select('id,amount_cents,paid_at,notes,status,technician_profile_id')
      .eq('workshop_account_id', workshopId)
      .neq('status', 'rejected')
      .gte('paid_at', `${currentMonthStart}T00:00:00.000Z`)
      .lte('paid_at', `${currentMonthEnd}T23:59:59.999Z`),
    supabase
      .from('invoices')
      .select('id,total_cents,updated_at')
      .eq('workshop_account_id', workshopId)
      .eq('payment_status', 'paid')
      .gte('updated_at', `${trendStart}T00:00:00.000Z`)
      .lte('updated_at', `${currentMonthEnd}T23:59:59.999Z`),
    supabase
      .from('technician_payouts')
      .select('id,amount_cents,paid_at,status')
      .eq('workshop_account_id', workshopId)
      .neq('status', 'rejected')
      .gte('paid_at', `${trendStart}T00:00:00.000Z`)
      .lte('paid_at', `${currentMonthEnd}T23:59:59.999Z`),
  ]);

  const financeTablesAvailable = !currentEntriesError && !yearlyEntriesError;
  const entries = financeTablesAvailable
    ? ((currentEntries ?? []) as EntryRow[])
    : [
        ...((currentPaidInvoices ?? []).map((invoice) => ({
          id: `invoice-${invoice.id}`,
          entry_kind: 'income' as const,
          source_type: 'job_income',
          category: 'jobs',
          description: invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : 'Invoice payment',
          amount_cents: invoice.total_cents ?? 0,
          occurred_on: String(invoice.updated_at ?? '').slice(0, 10),
          vendor_id: null,
          metadata: { invoice_id: invoice.id }
        })) as EntryRow[]),
        ...((currentPayouts ?? []).map((payout) => ({
          id: `payout-${payout.id}`,
          entry_kind: 'expense' as const,
          source_type: 'technician_payout',
          category: 'technician_pay',
          description: payout.notes ?? 'Technician payout',
          amount_cents: payout.amount_cents ?? 0,
          occurred_on: String(payout.paid_at ?? '').slice(0, 10),
          vendor_id: null,
          metadata: { technician_profile_id: payout.technician_profile_id }
        })) as EntryRow[])
      ];

  const incomeMonth = entries
    .filter((entry) => entry.entry_kind === 'income')
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
  const expenseMonth = entries
    .filter((entry) => entry.entry_kind === 'expense')
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
  const technicianExpenseMonth = entries
    .filter((entry) => entry.source_type === 'technician_payout')
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
  const recurringExpenseMonth = entries
    .filter((entry) => entry.source_type === 'recurring_expense')
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);

  const profitMonth = incomeMonth - expenseMonth;
  const targetCents = targetError ? 0 : Number(targetRow?.income_target_cents ?? 0);
  const progressPercent = targetCents > 0 ? Math.min(100, Math.round((incomeMonth / targetCents) * 100)) : 0;

  const vendorNameById = new Map(((vendorsError ? [] : vendors) ?? []).map((vendor) => [vendor.id, vendor.name]));

  const monthlyMap = new Map<string, MonthPoint>();
  for (let idx = 0; idx < 12; idx += 1) {
    const shifted = addMonths(twelveMonthsAgo.year, twelveMonthsAgo.month, idx);
    const key = `${shifted.year}-${String(shifted.month).padStart(2, '0')}`;
    monthlyMap.set(key, {
      monthKey: key,
      label: prettyMonthLabel(shifted.year, shifted.month),
      income: 0,
      expenses: 0,
      profit: 0,
      customers: 0
    });
  }

  if (financeTablesAvailable) {
    for (const row of yearlyEntries ?? []) {
      const key = monthKey(row.occurred_on);
      const point = monthlyMap.get(key);
      if (!point) continue;
      const value = Number(row.amount_cents ?? 0);
      if (row.entry_kind === 'income') point.income += value;
      if (row.entry_kind === 'expense') point.expenses += value;
    }
  } else {
    for (const row of yearlyPaidInvoices ?? []) {
      const key = monthKey(String(row.updated_at ?? ''));
      const point = monthlyMap.get(key);
      if (!point) continue;
      point.income += Number(row.total_cents ?? 0);
    }
    for (const row of yearlyPayouts ?? []) {
      const key = monthKey(String(row.paid_at ?? ''));
      const point = monthlyMap.get(key);
      if (!point) continue;
      point.expenses += Number(row.amount_cents ?? 0);
    }
  }

  for (const row of customerRows ?? []) {
    const key = monthKey(row.created_at as string);
    const point = monthlyMap.get(key);
    if (!point) continue;
    point.customers += 1;
  }

  const monthRows = Array.from(monthlyMap.values()).map((row) => ({
    ...row,
    profit: row.income - row.expenses
  }));

  const vendorSpendRows = entries
    .filter((entry) => entry.entry_kind === 'expense' && entry.vendor_id)
    .reduce((acc, entry) => {
      const key = entry.vendor_id as string;
      acc.set(key, (acc.get(key) ?? 0) + Number(entry.amount_cents ?? 0));
      return acc;
    }, new Map<string, number>());

  const topVendors = Array.from(vendorSpendRows.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([vendorId, spend]) => ({
      vendorId,
      name: vendorNameById.get(vendorId) ?? 'Unknown vendor',
      spend
    }));

  const visibleStatementArchives = (((statementArchivesError ? [] : statementArchives) ?? [])).filter((archive) => {
    const totals = (archive.totals ?? {}) as { income_cents?: number; expense_cents?: number; profit_cents?: number };
    const income = Number(totals.income_cents ?? 0);
    const expenses = Number(totals.expense_cents ?? 0);
    const profit = Number(totals.profit_cents ?? income - expenses);
    return income !== 0 || expenses !== 0 || profit !== 0;
  });

  const statementLines = [...entries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  return (
    <main className="space-y-6 pb-10">
      <section className="rounded-3xl border border-black/10 bg-gradient-to-br from-white via-[#faf7f2] to-[#f4f4ff] p-6 shadow-[0_18px_42px_rgba(17,17,17,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Management center</p>
            <h1 className="mt-1 text-2xl font-semibold text-black">{workshop?.name ?? 'Workshop'} business management</h1>
            <p className="mt-2 text-sm text-gray-600">Track monthly performance, control expenses, manage vendors, and monitor growth from one premium workspace.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/workshop/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </section>


      {!financeTablesAvailable ? (
        <Card className="rounded-3xl border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">Finance tables are not available yet in this environment, so this page is showing fallback totals from paid invoices and technician payouts. Run the latest Supabase migration to enable full finance logging, vendors, recurring expenses, and statement archives.</p>
        </Card>
      ) : null}

      <Card className="rounded-3xl border-black/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-black">One-time customer document upload</h2>
            <p className="mt-1 text-sm text-gray-600">Open the quick popup and continue into the normal upload workflow.</p>
          </div>
          <OneTimeUploadModal action={createUnlinkedUploadCase} />
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-4">
        <Card className="rounded-3xl border-black/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Income this month</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{formatMoney(incomeMonth)}</p>
          <p className="mt-2 text-xs text-gray-500">Auto from paid jobs + manual credits</p>
        </Card>
        <Card className="rounded-3xl border-black/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Expenses this month</p>
          <p className="mt-2 text-3xl font-semibold text-rose-700">{formatMoney(expenseMonth)}</p>
          <p className="mt-2 text-xs text-gray-500">Includes technician and recurring costs</p>
        </Card>
        <Card className="rounded-3xl border-black/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Profit this month</p>
          <p className={`mt-2 text-3xl font-semibold ${profitMonth >= 0 ? 'text-black' : 'text-rose-700'}`}>{formatMoney(profitMonth)}</p>
          <p className="mt-2 text-xs text-gray-500">Income minus expenses</p>
        </Card>
        <Card className="rounded-3xl border-black/10 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Monthly target</p>
            <ChartColumn className="h-4 w-4 text-gray-500" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <SegmentRing
              size={94}
              centerLabel={`${progressPercent}%`}
              subLabel="target"
              total={Math.max(targetCents, incomeMonth, 1)}
              segments={[{ value: incomeMonth, tone: 'positive', color: '#0f766e' }]}
            />
            <div className="text-right">
              <p className="text-xs text-gray-500">Target</p>
              <p className="text-lg font-semibold text-black">{targetCents > 0 ? formatMoney(targetCents) : 'Not set'}</p>
              <p className="text-xs text-gray-500">Achieved {formatMoney(incomeMonth)}</p>
            </div>
          </div>
          {ctx.profile.role === 'admin' ? (
            <form action={setMonthlyTarget} className="mt-4 flex gap-2">
              <input name="targetAmount" placeholder="e.g. 250000" className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <Button type="submit" size="sm">Save target</Button>
            </form>
          ) : null}
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-3xl border-black/10 p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-black">Current month credit/debit statement</h2>
            <p className="hidden text-xs text-gray-500 sm:block">{currentMonthStart} → {currentMonthEnd}</p>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">Total credits: <strong>{formatMoney(incomeMonth)}</strong></p>
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">Total debits: <strong>{formatMoney(expenseMonth)}</strong></p>
            <p className="rounded-xl bg-neutral-100 px-3 py-2 text-neutral-800">Net: <strong>{formatMoney(profitMonth)}</strong></p>
          </div>

          <div className="mt-3 sm:hidden">
            <p className="text-xs text-gray-500">{currentMonthStart} → {currentMonthEnd}</p>
            <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
              <Link href="/workshop/management/statement">View entire statement</Link>
            </Button>
          </div>

          <div className="mt-4 hidden overflow-x-auto sm:block">
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
                {statementLines.length ? (
                  statementLines.map((entry) => (
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
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-center text-sm text-gray-500" colSpan={6}>No entries this month yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="rounded-3xl border-black/10 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-black sm:text-base">Expense breakdown</h2>
          <div className="mt-3 space-y-2 text-xs sm:mt-4 sm:space-y-3 sm:text-sm">
            <div className="rounded-2xl border border-black/10 p-2.5 sm:p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500 sm:text-xs">Technician payouts</p>
              <p className="mt-1 text-lg font-semibold text-black sm:text-2xl">{formatMoney(technicianExpenseMonth)}</p>
            </div>
            <div className="rounded-2xl border border-black/10 p-2.5 sm:p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500 sm:text-xs">Recurring expenses</p>
              <p className="mt-1 text-lg font-semibold text-black sm:text-2xl">{formatMoney(recurringExpenseMonth)}</p>
            </div>
            <div className="rounded-2xl border border-black/10 p-2.5 sm:p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500 sm:text-xs">Top vendors (this month)</p>
              <ul className="mt-2 space-y-1 text-[11px] text-gray-600 sm:text-xs">
                {topVendors.length ? topVendors.map((vendor) => (
                  <li key={vendor.vendorId} className="flex justify-between gap-2"><span className="truncate">{vendor.name}</span><strong>{formatMoney(vendor.spend)}</strong></li>
                )) : <li>No vendor spend yet this month.</li>}
              </ul>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TrendBars title="Income (12 months)" rows={monthRows} keyName="income" colorClass="bg-emerald-500" />
        <TrendBars title="Expenses (12 months)" rows={monthRows} keyName="expenses" colorClass="bg-rose-500" />
        <TrendBars title="Profit (12 months)" rows={monthRows} keyName="profit" colorClass="bg-neutral-900" />
        <TrendBars title="Customer growth (12 months)" rows={monthRows} keyName="customers" colorClass="bg-sky-500" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-3xl border-black/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-black">Add income or expense</h2>
            <PlusCircle className="h-4 w-4 text-gray-500" />
          </div>
          {ctx.profile.role === 'admin' ? (
            <form action={addManualEntry} className="mt-4 grid gap-3 sm:grid-cols-2">
              <select name="entryKind" className="rounded-xl border border-black/15 px-3 py-2 text-sm">
                <option value="expense">Expense (debit)</option>
                <option value="income">Income (credit)</option>
              </select>
              <input name="amount" placeholder="Amount (ZAR)" className="rounded-xl border border-black/15 px-3 py-2 text-sm" required />
              <input name="description" placeholder="Description" className="rounded-xl border border-black/15 px-3 py-2 text-sm sm:col-span-2" required />
              <input name="category" placeholder="Category (parts, rent, etc.)" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="occurredOn" type="date" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <select name="vendorId" className="rounded-xl border border-black/15 px-3 py-2 text-sm sm:col-span-2">
                <option value="">No vendor</option>
                {((vendorsError ? [] : vendors) ?? []).map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
              <div className="sm:col-span-2">
                <Button type="submit">Save entry</Button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-gray-600">Only admins can add manual finance entries.</p>
          )}
        </Card>

        <Card className="rounded-3xl border-black/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-black">Recurring expenses</h2>
            <Repeat className="h-4 w-4 text-gray-500" />
          </div>
          {ctx.profile.role === 'admin' ? (
            <form action={addRecurringExpense} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input name="title" placeholder="Expense title" className="rounded-xl border border-black/15 px-3 py-2 text-sm sm:col-span-2" required />
              <input name="amount" placeholder="Amount (ZAR)" className="rounded-xl border border-black/15 px-3 py-2 text-sm" required />
              <select name="cadence" className="rounded-xl border border-black/15 px-3 py-2 text-sm">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
              <input name="nextRunOn" type="date" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="category" placeholder="Category" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <select name="vendorId" className="rounded-xl border border-black/15 px-3 py-2 text-sm sm:col-span-2">
                <option value="">No vendor</option>
                {((vendorsError ? [] : vendors) ?? []).map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
              <textarea name="notes" placeholder="Notes" rows={2} className="rounded-xl border border-black/15 px-3 py-2 text-sm sm:col-span-2" />
              <div className="sm:col-span-2">
                <Button type="submit">Add recurring expense</Button>
              </div>
            </form>
          ) : null}
          <div className="mt-5 space-y-2 text-sm">
            {((recurringError ? [] : recurring) ?? []).length ? ((recurringError ? [] : recurring) ?? []).map((row) => (
              <div key={row.id} className="rounded-xl border border-black/10 px-3 py-2">
                <p className="font-medium text-black">{row.title}</p>
                <p className="text-xs text-gray-500">{row.cadence} • next run {row.next_run_on} • {formatMoney(Number(row.amount_cents ?? 0))}</p>
              </div>
            )) : <p className="text-sm text-gray-500">No recurring expenses yet.</p>}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-3xl border-black/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-black">Vendors</h2>
            <Building2 className="h-4 w-4 text-gray-500" />
          </div>
          {ctx.profile.role === 'admin' ? (
            <form action={addVendor} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input name="vendorName" placeholder="Vendor name" required className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="contactPerson" placeholder="Contact person" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="vendorEmail" type="email" placeholder="Vendor email" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="vendorPhone" placeholder="Vendor phone" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <textarea name="vendorNotes" rows={2} placeholder="Notes" className="rounded-xl border border-black/15 px-3 py-2 text-sm sm:col-span-2" />
              <div className="sm:col-span-2">
                <Button type="submit">Add vendor</Button>
              </div>
            </form>
          ) : null}
          <div className="mt-5 max-h-72 space-y-2 overflow-auto">
            {((vendorsError ? [] : vendors) ?? []).length ? ((vendorsError ? [] : vendors) ?? []).map((vendor) => (
              <div key={vendor.id} className="rounded-xl border border-black/10 p-3">
                <p className="font-semibold text-black">{vendor.name}</p>
                <p className="mt-1 text-xs text-gray-500">{vendor.contact_person ?? 'No contact'} • {vendor.email ?? 'No email'} • {vendor.phone ?? 'No phone'}</p>
              </div>
            )) : <p className="text-sm text-gray-500">No vendors yet.</p>}
          </div>
        </Card>

        <Card className="rounded-3xl border-black/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-black">Archived monthly statements</h2>
            <Coins className="h-4 w-4 text-gray-500" />
          </div>
          <p className="mt-1 text-xs text-gray-500">Snapshots are automatically stored monthly so you can review previous periods.</p>
          <div className="mt-4 space-y-2">
            {visibleStatementArchives.length ? visibleStatementArchives.map((archive) => {
              const totals = (archive.totals ?? {}) as { income_cents?: number; expense_cents?: number; profit_cents?: number };
              return (
                <div key={archive.id} className="rounded-xl border border-black/10 p-3 text-sm">
                  <p className="font-semibold text-black">{archive.month_start} → {archive.month_end}</p>
                  <p className="mt-1 text-xs text-gray-600">Income {formatMoney(Number(totals.income_cents ?? 0))} • Expenses {formatMoney(Number(totals.expense_cents ?? 0))} • Profit {formatMoney(Number(totals.profit_cents ?? 0))}</p>
                  {archive.pdf_storage_path ? (
                    <Link href={`/api/workshop/statements/${archive.id}/download`} className="mt-2 inline-flex text-xs font-semibold text-black underline underline-offset-2">
                      Download PDF statement
                    </Link>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">PDF statement is being prepared.</p>
                  )}
                </div>
              );
            }) : <p className="text-sm text-gray-500">No archived months with activity yet.</p>}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl border-black/10 p-4">
          <div className="flex items-center gap-3 text-gray-700"><TrendingUp className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.14em]">Growth focus</p></div>
          <p className="mt-2 text-sm text-gray-600">Use 12-month trend cards to spot revenue dips and rising cost pressure before cashflow is affected.</p>
        </Card>
        <Card className="rounded-3xl border-black/10 p-4">
          <div className="flex items-center gap-3 text-gray-700"><HandCoins className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.14em]">Auto capture</p></div>
          <p className="mt-2 text-sm text-gray-600">Paid jobs and technician payouts are automatically tracked in your monthly statement.</p>
        </Card>
        <Card className="rounded-3xl border-black/10 p-4">
          <div className="flex items-center gap-3 text-gray-700"><Users className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.14em]">Customer trend</p></div>
          <p className="mt-2 text-sm text-gray-600">Track monthly customer acquisition and compare with profit trend to validate growth quality.</p>
        </Card>
        <Card className="rounded-3xl border-black/10 p-4">
          <div className="flex items-center gap-3 text-gray-700"><PlusCircle className="h-4 w-4" /><p className="text-xs uppercase tracking-[0.14em]">Operational control</p></div>
          <p className="mt-2 text-sm text-gray-600">Update target, log manual credits/debits, and manage vendors without leaving this page.</p>
        </Card>
      </section>
    </main>
  );
}
