import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend || !resendFromEmail) return;

  await resend.emails.send({
    from: resendFromEmail,
    to,
    subject,
    html
  });
}
