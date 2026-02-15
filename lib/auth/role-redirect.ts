import { customerDashboard, workshopDashboard } from '@/lib/routes';

export type UserRole = 'admin' | 'technician' | 'customer';

export function getDashboardPathForRole(role?: UserRole | null) {
  if (role === 'admin' || role === 'technician') {
    return workshopDashboard();
  }

  return customerDashboard();
}
