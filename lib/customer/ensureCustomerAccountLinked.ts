import 'server-only';

import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

export async function ensureCustomerAccountLinked() {
  const context = await getCustomerContextOrCreate();
  if (!context) return null;

  return {
    id: context.customer_account.id,
    workshop_account_id: context.workshop_account_id
  };
}
