import { redirect } from 'next/navigation';
import { customerDashboard } from '@/lib/routes';

export default function LegacyDashboardPage() {
  redirect(customerDashboard());
}
