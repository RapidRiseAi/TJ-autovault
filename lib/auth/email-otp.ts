import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/resend';

function getAdminAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function sendEmailOtp(email: string) {
  const supabase = getAdminAuthClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/verify-email` }
  });

  if (error) throw new Error(error.message);

  const otp = data.properties?.email_otp;
  if (!otp) throw new Error('Could not generate OTP.');

  await sendEmail(
    email,
    'Your AutoVault verification code',
    `<p>Your AutoVault verification code is: <b>${otp}</b></p><p>This code expires shortly.</p>`
  );
}
