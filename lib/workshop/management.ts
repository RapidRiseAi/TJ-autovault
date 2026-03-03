import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkshopProfileContext = {
  id: string;
  role: 'admin' | 'technician' | 'customer';
  workshop_account_id: string | null;
};

export function getSaTodayParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '1970');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');

  return { year, month, day };
}

export function monthStartIso(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthEndIso(year: number, month: number) {
  const end = new Date(Date.UTC(year, month, 0));
  const endYear = end.getUTCFullYear();
  const endMonth = String(end.getUTCMonth() + 1).padStart(2, '0');
  const endDay = String(end.getUTCDate()).padStart(2, '0');
  return `${endYear}-${endMonth}-${endDay}`;
}

export function addMonths(year: number, month: number, delta: number) {
  const source = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: source.getUTCFullYear(),
    month: source.getUTCMonth() + 1
  };
}

export function formatMoney(cents: number | bigint) {
  const amount = typeof cents === 'bigint' ? Number(cents) : cents;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount / 100);
}

export function parseMoneyInputToCents(value: string) {
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.').trim();
  if (!cleaned) return 0;
  const amount = Number.parseFloat(cleaned);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

export async function requireWorkshopContext(supabase: SupabaseClient) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !profile.workshop_account_id) return null;

  return {
    user,
    profile: profile as WorkshopProfileContext
  };
}

export async function materializeRecurringExpensesForWorkshop(
  supabase: SupabaseClient,
  workshopId: string,
  actorId: string
) {
  const today = new Date();
  const { data: recurringRows } = await supabase
    .from('workshop_recurring_expenses')
    .select('id,title,amount_cents,category,next_run_on,cadence,vendor_id,is_active')
    .eq('workshop_account_id', workshopId)
    .eq('is_active', true)
    .lte('next_run_on', monthEndIso(getSaTodayParts(today).year, getSaTodayParts(today).month));

  for (const recurring of recurringRows ?? []) {
    const cursor = new Date(`${recurring.next_run_on}T00:00:00.000Z`);
    const boundary = new Date(`${monthEndIso(getSaTodayParts(today).year, getSaTodayParts(today).month)}T00:00:00.000Z`);

    while (cursor <= boundary) {
      const occurredOn = cursor.toISOString().slice(0, 10);
      await supabase.from('workshop_finance_entries').upsert(
        {
          workshop_account_id: workshopId,
          entry_kind: 'expense',
          source_type: 'recurring_expense',
          category: recurring.category ?? 'recurring',
          description: recurring.title,
          amount_cents: recurring.amount_cents,
          occurred_on: occurredOn,
          vendor_id: recurring.vendor_id,
          external_ref_type: 'recurring_expense',
          external_ref_id: `${recurring.id}:${occurredOn}`,
          metadata: { recurring_expense_id: recurring.id, occurred_on: occurredOn },
          created_by: actorId
        },
        { onConflict: 'workshop_account_id,source_type,external_ref_type,external_ref_id' }
      );

      if (recurring.cadence === 'weekly') {
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      } else {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    const nextRunOn = cursor.toISOString().slice(0, 10);
    await supabase
      .from('workshop_recurring_expenses')
      .update({ next_run_on: nextRunOn })
      .eq('id', recurring.id)
      .eq('workshop_account_id', workshopId);
  }
}

export async function ensureStatementArchivesUpToLastMonth(
  supabase: SupabaseClient,
  workshopId: string
) {
  const { year, month } = getSaTodayParts();
  for (let back = 1; back <= 12; back += 1) {
    const target = addMonths(year, month, -back);
    const start = monthStartIso(target.year, target.month);
    const end = monthEndIso(target.year, target.month);

    const { data: exists } = await supabase
      .from('workshop_monthly_statement_archives')
      .select('id')
      .eq('workshop_account_id', workshopId)
      .eq('month_start', start)
      .maybeSingle();

    if (exists) continue;

    const { data: entries } = await supabase
      .from('workshop_finance_entries')
      .select('id,entry_kind,source_type,category,description,amount_cents,occurred_on,vendor_id,metadata')
      .eq('workshop_account_id', workshopId)
      .gte('occurred_on', start)
      .lte('occurred_on', end)
      .order('occurred_on', { ascending: true });

    const income = (entries ?? [])
      .filter((entry) => entry.entry_kind === 'income')
      .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
    const expenses = (entries ?? [])
      .filter((entry) => entry.entry_kind === 'expense')
      .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);

    await supabase.from('workshop_monthly_statement_archives').insert({
      workshop_account_id: workshopId,
      month_start: start,
      month_end: end,
      totals: {
        income_cents: income,
        expense_cents: expenses,
        profit_cents: income - expenses
      },
      line_items: entries ?? []
    });
  }
}
