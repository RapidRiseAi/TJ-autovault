'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { UploadsActionsForm } from '@/components/workshop/uploads-actions-form';
import { ActionTile } from '@/components/workshop/action-tile';

export function WorkshopVehicleActionsPanel({ vehicleId, invoices, jobs, workRequests, currentMileage, uploadDestinationLabel, initialUploadMode, initialUploadSubject }: { vehicleId: string; invoices: Array<{ id: string; invoiceNumber?: string | null; paymentStatus?: string | null; totalCents?: number | null }>; jobs: Array<{ id: string }>; workRequests: Array<{ id: string; status: string }>; currentMileage: number; uploadDestinationLabel: string; initialUploadMode?: 'quote' | 'invoice' | 'inspection_report' | 'warning'; initialUploadSubject?: string; }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(Boolean(initialUploadMode));

  useEffect(() => {
    if (!initialUploadMode) return;
    setUploadOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('quoteRecommendationId');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [initialUploadMode, pathname, router, searchParams]);

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
        <UploadsActionsForm vehicleId={vehicleId} destinationLabel={uploadDestinationLabel} onSuccess={() => setUploadOpen(false)} initialDocumentType={initialUploadMode} initialSubject={initialUploadSubject} />
      </Modal>
    </>
  );
}
