'use client';

import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export function ConfirmModal({
  open,
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel,
  isLoading,
  children,
  danger = false
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  isLoading?: boolean;
  children?: ReactNode;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        {description ? (
          <p className="text-sm text-gray-600">{description}</p>
        ) : null}
        {children}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={danger ? 'bg-red-700 hover:bg-red-800' : ''}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
