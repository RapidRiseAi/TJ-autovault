'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { UploadsActionsForm } from '@/components/workshop/uploads-actions-form';
import { ActionTile } from '@/components/workshop/action-tile';

export function WorkshopVehicleActionsPanel({ vehicleId, invoices, jobs, workRequests }: { vehicleId: string; invoices: Array<{ id: string }>; jobs: Array<{ id: string }>; workRequests: Array<{ id: string; status: string }> }) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActionTile title="Upload document" description="Attach reports, invoices, quotes, or photos for this vehicle." onClick={() => setUploadOpen(true)} />
      </div>
      <VehicleWorkflowActions vehicleId={vehicleId} invoices={invoices} jobs={jobs} workRequests={workRequests} />
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document">
        <UploadsActionsForm vehicleId={vehicleId} onSuccess={() => setUploadOpen(false)} />
      </Modal>
    </>
  );
}
