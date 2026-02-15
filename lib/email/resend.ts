import { Resend } from '@resend/node';
import { appConfig } from '@/lib/config/app-config';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) return;
  await resend.emails.send({
    from: appConfig.email.from,
    to,
    subject,
    html
  });
}
