import { redirect } from 'next/navigation';
import { customerVehicleNew } from '@/lib/routes';

export default function LegacyNewVehiclePage() {
  redirect(customerVehicleNew());
}
