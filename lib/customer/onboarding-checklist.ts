import type { SupabaseClient } from '@supabase/supabase-js';

export type OnboardingTask = {
  id: string;
  title: string;
  description: string;
  href: string;
  required: boolean;
  complete: boolean;
};

export type CustomerOnboardingChecklist = {
  profileTasks: OnboardingTask[];
  completedRequiredProfileTasks: number;
  totalRequiredProfileTasks: number;
  profileCompletionPercent: number;
};

function toPercent(done: number, total: number) {
  if (total <= 0) return 100;
  return Math.round((done / total) * 100);
}

export async function getCustomerOnboardingChecklist(input: {
  supabase: SupabaseClient;
  userId: string;
  customerAccountId: string;
}): Promise<CustomerOnboardingChecklist> {
  const { supabase, userId, customerAccountId } = input;

  const [{ data: profile }, { count: vehicleCount }, { data: notificationPrefs }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name,phone,preferred_contact_method,billing_name,billing_address,avatar_url'
        )
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('current_customer_account_id', customerAccountId),
      supabase
        .from('notification_email_preferences')
        .select('profile_id')
        .eq('profile_id', userId)
        .maybeSingle()
    ]);

  const hasFullName = Boolean(profile?.full_name?.trim());
  const hasPhone = Boolean(profile?.phone?.trim());
  const hasContactMethod = Boolean(profile?.preferred_contact_method?.trim());
  const hasBillingName = Boolean(profile?.billing_name?.trim());
  const hasBillingAddress = Boolean(profile?.billing_address?.trim());
  const hasAvatar = Boolean(profile?.avatar_url?.trim());
  const hasVehicle = (vehicleCount ?? 0) > 0;
  const reviewedNotificationPreferences = Boolean(notificationPrefs?.profile_id);

  const profileTasks: OnboardingTask[] = [
    {
      id: 'full-name',
      title: 'Add your full name',
      description: 'Use your real name so your workshop and invoices are accurate.',
      href: '/customer/profile/edit',
      required: true,
      complete: hasFullName
    },
    {
      id: 'contact',
      title: 'Set contact details',
      description: 'Add a phone number and preferred contact method for urgent updates.',
      href: '/customer/profile/edit',
      required: true,
      complete: hasPhone && hasContactMethod
    },
    {
      id: 'billing',
      title: 'Complete billing details',
      description: 'Fill in billing name and address for statements and invoices.',
      href: '/customer/profile/edit',
      required: true,
      complete: hasBillingName && hasBillingAddress
    },
    {
      id: 'vehicle',
      title: 'Add your first vehicle',
      description: 'Vehicles unlock timeline tracking, documents, and job updates.',
      href: '/customer/vehicles/new',
      required: true,
      complete: hasVehicle
    },
    {
      id: 'notifications',
      title: 'Review notification preferences',
      description: 'Choose what alerts you receive to avoid missing key updates.',
      href: '/customer/profile/notifications',
      required: true,
      complete: reviewedNotificationPreferences
    },
    {
      id: 'avatar',
      title: 'Upload a profile photo',
      description: 'Optional but recommended for a more personal account profile.',
      href: '/customer/profile/edit',
      required: false,
      complete: hasAvatar
    }
  ];

  const requiredTasks = profileTasks.filter((task) => task.required);
  const completedRequiredProfileTasks = requiredTasks.filter((task) => task.complete).length;

  return {
    profileTasks,
    completedRequiredProfileTasks,
    totalRequiredProfileTasks: requiredTasks.length,
    profileCompletionPercent: toPercent(completedRequiredProfileTasks, requiredTasks.length)
  };
}
