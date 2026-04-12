export type VehicleVisibilityRow = {
  id: string;
  is_temporary?: boolean | null;
  archived_at?: string | null;
};

export function getTemporaryVehicleLimitByTier(tier?: string | null) {
  const normalized = (tier ?? '').toLowerCase();
  if (normalized === 'business') return 3;
  if (normalized === 'pro') return 1;
  return 0;
}

export function filterVisibleCustomerVehicles<T extends VehicleVisibilityRow>(
  vehicles: T[],
  temporaryVehicleLimit: number
) {
  const activeVehicles = vehicles.filter((vehicle) => !vehicle.archived_at);
  const standard = activeVehicles.filter((vehicle) => !vehicle.is_temporary);
  const temporary = activeVehicles.filter((vehicle) => vehicle.is_temporary);
  return [...standard, ...temporary.slice(0, Math.max(0, temporaryVehicleLimit))];
}

export function isVehicleVisibleForCustomer<T extends VehicleVisibilityRow>(
  vehicle: T,
  vehicles: T[],
  temporaryVehicleLimit: number
) {
  return filterVisibleCustomerVehicles(vehicles, temporaryVehicleLimit).some(
    (entry) => entry.id === vehicle.id
  );
}
