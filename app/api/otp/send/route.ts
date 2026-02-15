import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/resend';

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login` }
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const otp = data.properties?.email_otp;
  if (otp) {
    await sendEmail(email, 'Your AutoVault verification code', `<p>Your OTP: <b>${otp}</b></p>`);
  }

  return NextResponse.json({ ok: true });
}
