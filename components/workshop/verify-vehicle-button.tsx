'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { verifyVehicle } from '@/lib/actions/workshop';
import { useToast } from '@/components/ui/toast-provider';

export function VerifyVehicleButton({ vehicleId, disabled = false }: { vehicleId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { pushToast } = useToast();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>Verify</Button>
      <ConfirmModal
        open={open}
        onClose={() => {
          if (!isPending) setOpen(false);
        }}
        onConfirm={() => {
          startTransition(async () => {
            const result = await verifyVehicle({ vehicleId });
            if (!result.ok) {
              pushToast({ title: 'Could not verify vehicle', description: result.error, tone: 'error' });
              return;
            }
            pushToast({ title: 'Vehicle verified', tone: 'success' });
            setOpen(false);
            router.refresh();
          });
        }}
        title="Verify vehicle"
        description="Confirm this vehicle has been reviewed and approved."
        confirmLabel="Verify vehicle"
        isLoading={isPending}
      />
    </>
  );
}
