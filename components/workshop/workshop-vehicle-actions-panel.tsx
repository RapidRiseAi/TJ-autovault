'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { UploadsActionsForm } from '@/components/workshop/uploads-actions-form';

export function WorkshopVehicleActionsPanel({ vehicleId, invoices, jobs, workRequests }: { vehicleId: string; invoices: Array<{ id: string }>; jobs: Array<{ id: string }>; workRequests: Array<{ id: string; status: string }> }) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>Upload document</Button></div>
      <VehicleWorkflowActions vehicleId={vehicleId} invoices={invoices} jobs={jobs} workRequests={workRequests} compact />
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document"><UploadsActionsForm vehicleId={vehicleId} onSuccess={() => setUploadOpen(false)} /></Modal>
    </>
  );
}
