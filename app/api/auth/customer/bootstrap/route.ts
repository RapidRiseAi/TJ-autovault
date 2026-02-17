import { NextResponse } from 'next/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

export async function POST() {
  const context = await getCustomerContextOrCreate();

  if (!context) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ customerAccountId: context.customer_account.id });
}
