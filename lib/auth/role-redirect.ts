import { customerDashboard, workshopDashboard } from '@/lib/routes';

export type UserRole = 'admin' | 'technician' | 'customer' | 'inactive_technician';

export function getDashboardPathForRole(role?: UserRole | string | null) {
  if (role === 'admin' || role === 'technician') {
    return workshopDashboard();
  }

  if (role === 'inactive_technician') {
    return '/login?error=inactive_technician';
  }

  // Fallback unknown roles to customer dashboard to preserve current default behaviour.
  // Middleware/login guards still enforce route-level authorization.
  if (role === 'customer') {
    return customerDashboard();
  }

  return customerDashboard();
}
