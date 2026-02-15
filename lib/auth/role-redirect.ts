export type UserRole = 'admin' | 'technician' | 'customer';

export function getDashboardPathForRole(role?: UserRole | null) {
  if (role === 'admin' || role === 'technician') {
    return '/workshop/dashboard';
  }

  return '/customer/dashboard';
}
