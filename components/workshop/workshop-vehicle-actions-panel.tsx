'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { UploadsActionsForm } from '@/components/workshop/uploads-actions-form';
import { ActionTile } from '@/components/workshop/action-tile';

export function WorkshopVehicleActionsPanel({ vehicleId, invoices, jobs, workRequests, currentMileage, uploadDestinationLabel }: { vehicleId: string; invoices: Array<{ id: string; invoiceNumber?: string | null; paymentStatus?: string | null; totalCents?: number | null }>; jobs: Array<{ id: string }>; workRequests: Array<{ id: string; status: string }>; currentMileage: number; uploadDestinationLabel: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <ActionTile
          title="Upload document"
          description="Attach reports, invoices, quotes, or photos for this vehicle."
          icon={<Upload className="h-4 w-4" />}
          primary
          onClick={() => setUploadOpen(true)}
        />
      </div>
      <VehicleWorkflowActions vehicleId={vehicleId} invoices={invoices} jobs={jobs} workRequests={workRequests} currentMileage={currentMileage} />
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document">
        <UploadsActionsForm vehicleId={vehicleId} destinationLabel={uploadDestinationLabel} onSuccess={() => setUploadOpen(false)} />
      </Modal>
    </>
  );
}
