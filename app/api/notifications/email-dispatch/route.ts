import { NextResponse } from 'next/server';
import { dispatchNotificationEmails } from '@/lib/email/notification-dispatch';

function isAuthorized(request: Request) {
  const secret = process.env.NOTIFICATION_EMAIL_CRON_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return bearer === secret;
}

async function runDispatch(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchNotificationEmails({ limit: 100 });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return runDispatch(request);
}

export async function GET(request: Request) {
  return runDispatch(request);
}
