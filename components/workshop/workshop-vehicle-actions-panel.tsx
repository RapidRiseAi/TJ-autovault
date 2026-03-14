'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { UploadsActionsForm } from '@/components/workshop/uploads-actions-form';
import { ActionTile } from '@/components/workshop/action-tile';

export function WorkshopVehicleActionsPanel({
  vehicleId,
  invoices,
  jobs,
  workRequests,
  currentMileage,
  uploadDestinationLabel,
  initialUploadMode,
  initialUploadSubject,
  pendingCloseJobId,
  pendingInvoiceQuoteId,
  pendingInvoiceAmountCents,
  technicians,
  currentProfileId,
  customerAccountId,
  oneTimeClientDetails,
  prependTiles
}: {
  vehicleId: string;
  invoices: Array<{
    id: string;
    invoiceNumber?: string | null;
    paymentStatus?: string | null;
    totalCents?: number | null;
  }>;
  jobs: Array<{ id: string }>;
  workRequests: Array<{ id: string; status: string }>;
  currentMileage: number;
  uploadDestinationLabel: string;
  initialUploadMode?: 'quote' | 'invoice' | 'inspection_report' | 'warning';
  initialUploadSubject?: string;
  pendingCloseJobId?: string;
  pendingInvoiceQuoteId?: string;
  pendingInvoiceAmountCents?: number;
  technicians: Array<{ id: string; name: string }>;
  currentProfileId?: string;
  customerAccountId?: string | null;
  oneTimeClientDetails?: {
    enabled: boolean;
    customerName: string;
    notificationEmail?: string;
    billingName?: string;
    billingCompany?: string;
    billingEmail?: string;
    billingPhone?: string;
    billingAddress?: string;
    registrationNumber?: string;
    make?: string;
    model?: string;
    vin?: string;
  };
  prependTiles?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(Boolean(initialUploadMode));
  const [pendingCloseOnInvoiceJobId] = useState(pendingCloseJobId);

  useEffect(() => {
    if (!initialUploadMode) return;
    setUploadOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('quoteRecommendationId');
    params.delete('upload');
    params.delete('closeJobId');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [initialUploadMode, pathname, router, searchParams]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4">
        {prependTiles}
        <ActionTile
          title="Upload document"
          description="Attach reports, invoices, quotes, or photos for this vehicle."
          icon={<Upload className="h-4 w-4" />}
          primary
          compactMobile
          onClick={() => setUploadOpen(true)}
        />
      </div>
      <VehicleWorkflowActions
        vehicleId={vehicleId}
        invoices={invoices}
        jobs={jobs}
        workRequests={workRequests}
        currentMileage={currentMileage}
      />
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload document"
        maxWidthClass="max-w-5xl"
      >
        <UploadsActionsForm
          vehicleId={vehicleId}
          destinationLabel={uploadDestinationLabel}
          onSuccess={() => setUploadOpen(false)}
          initialDocumentType={initialUploadMode}
          initialSubject={initialUploadSubject}
          pendingCloseJobId={pendingCloseOnInvoiceJobId}
          linkedQuoteId={pendingInvoiceQuoteId}
          initialAmountCents={pendingInvoiceAmountCents}
          currentMileage={currentMileage}
          technicians={technicians}
          currentProfileId={currentProfileId}
          customerAccountId={customerAccountId}
          oneTimeClientDetails={oneTimeClientDetails}
        />
      </Modal>
    </>
  );
}
