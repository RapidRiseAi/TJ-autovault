'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const quoteDecisionSchema = z.object({
  quoteId: z.string().uuid(),
  decision: z.enum(['approved', 'declined'])
});

export async function decideQuote(input: unknown) {
  const { quoteId, decision } = quoteDecisionSchema.parse(input);
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const { data: quote, error: quoteError } = await supabase
    .from('quote_uploads')
    .select('workshop_account_id,work_order_id,storage_path')
    .eq('id', quoteId)
    .single();
  if (quoteError) throw quoteError;

  const now = new Date().toISOString();
  const insertRow = {
    workshop_account_id: quote.workshop_account_id,
    work_order_id: quote.work_order_id,
    storage_path: quote.storage_path,
    status: decision,
    approved_at: decision === 'approved' ? now : null,
    declined_at: decision === 'declined' ? now : null,
    approved_by_profile_id: decision === 'approved' ? user.id : null,
    correction_of_id: quoteId
  };

  const { error } = await supabase.from('quote_uploads').insert([insertRow]);
  if (error) throw error;
}
