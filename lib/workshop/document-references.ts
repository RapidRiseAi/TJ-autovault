import type { SupabaseClient } from '@supabase/supabase-js';

type SupportedDocumentKind = 'invoice' | 'quote';

const REFERENCE_META: Record<
  SupportedDocumentKind,
  { table: 'invoices' | 'quotes'; column: 'invoice_number' | 'quote_number'; prefix: string }
> = {
  invoice: { table: 'invoices', column: 'invoice_number', prefix: 'INV' },
  quote: { table: 'quotes', column: 'quote_number', prefix: 'QTE' }
};

function extractSequence(reference: string, prefix: string) {
  const match = reference
    .trim()
    .toUpperCase()
    .match(new RegExp(`^${prefix}-(\\d+)$`));
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export async function getNextDocumentReference(args: {
  supabase: SupabaseClient;
  workshopAccountId: string;
  kind: SupportedDocumentKind;
}) {
  const meta = REFERENCE_META[args.kind];

  const { data } = await args.supabase
    .from(meta.table)
    .select(meta.column)
    .eq('workshop_account_id', args.workshopAccountId)
    .ilike(meta.column, `${meta.prefix}-%`)
    .order('created_at', { ascending: false })
    .limit(200);

  const nextSequence =
    (data ?? []).reduce((max: number, row: Record<string, unknown>) => {
      const sequence = extractSequence(String(row[meta.column] ?? ''), meta.prefix);
      return sequence && sequence > max ? sequence : max;
    }, 0) + 1;

  return `${meta.prefix}-${String(nextSequence).padStart(4, '0')}`;
}

export function addDaysToIsoDate(isoDate: string, days = 7) {
  const base = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + days);
    return fallback.toISOString().slice(0, 10);
  }

  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}
