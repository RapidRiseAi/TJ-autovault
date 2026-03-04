import { NextRequest, NextResponse } from 'next/server';
import { sendEmailOtp } from '@/lib/auth/email-otp';

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  const normalizedEmail = (email ?? '').toString().trim().toLowerCase();

  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  try {
    await sendEmailOtp(normalizedEmail);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send OTP';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
