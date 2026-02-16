import { NextResponse } from 'next/server';
import { ensureCustomerAccountLinked } from '@/lib/customer/ensureCustomerAccountLinked';

export async function POST() {
  const customerAccount = await ensureCustomerAccountLinked();

  if (!customerAccount) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ customerAccountId: customerAccount.id });
}
