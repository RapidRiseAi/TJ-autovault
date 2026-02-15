import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/resend';

export async function POST(req: NextRequest) {
  const { to, workOrderId } = await req.json();
  await sendEmail(to, 'Quote uploaded', `<p>Your quote for work order ${workOrderId} is now available in portal.</p>`);
  return NextResponse.json({ ok: true });
}
