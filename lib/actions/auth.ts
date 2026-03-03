'use server';

import { redirect } from 'next/navigation';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { createClient } from '@/lib/supabase/server';

export async function signupCustomerAction(formData: FormData) {
  const email = formData.get('email')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  const displayName = formData.get('displayName')?.toString().trim() ?? '';
  const plan = formData.get('plan')?.toString() ?? 'basic';

  const tier = plan === 'pro' || plan === 'business' ? plan : 'basic';

  if (!email || !password) {
    redirect('/signup?error=Email%20and%20password%20are%20required');
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, selected_plan: tier } }
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user) {
    redirect('/signup?error=Signup%20failed.%20Please%20try%20again.');
  }

  const context = await getCustomerContextOrCreate({
    displayName,
    tier,
    allowAutoCreate: false
  });

  if (!context) {
    redirect('/signup?error=Your%20email%20is%20not%20linked%20to%20a%20workshop%20customer%20record%20yet.%20Please%20ask%20the%20workshop%20to%20link%20your%20email.');
  }

  redirect('/login?created=1');
}
