import { redirect } from 'next/navigation';
import { customerDashboard } from '@/lib/routes';

export default function LegacyCustomerDashboardPage() {
  redirect(customerDashboard());
}
