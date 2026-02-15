import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/resend';

export async function POST(req: NextRequest) {
  const { to, invoiceId } = await req.json();
  await sendEmail(to, 'Invoice uploaded', `<p>Your invoice ${invoiceId} is now available in portal.</p>`);
  return NextResponse.json({ ok: true });
}
