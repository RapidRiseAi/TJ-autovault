import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { message?: string }
    | null;

  const message = (body?.message ?? '').trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, error: 'Please describe the issue you are facing.' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,display_name,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.workshop_account_id) {
    return NextResponse.json(
      {
        ok: false,
        error: profileError?.message ?? 'Could not load workshop profile.'
      },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabase.from('support_tickets').insert({
    workshop_account_id: profile.workshop_account_id,
    profile_id: profile.id,
    customer_email: user.email ?? null,
    subject: 'App support ticket',
    message
  });

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: `Could not submit support ticket: ${insertError.message}` },
      { status: 400 }
    );
  }

  await sendEmail(
    'team@rapidriseai.com',
    'New app support ticket',
    `<h2>New support ticket</h2>
<p><strong>Email:</strong> ${escapeHtml(user.email ?? 'Unknown')}</p>
<p><strong>Name:</strong> ${escapeHtml(profile.display_name ?? 'Unknown')}</p>
<p><strong>Role:</strong> ${escapeHtml(profile.role ?? 'Unknown')}</p>
<p><strong>Workshop ID:</strong> ${escapeHtml(profile.workshop_account_id ?? 'Unknown')}</p>
<p><strong>Issue:</strong></p>
<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>`
  );

  return NextResponse.json({ ok: true });
}
