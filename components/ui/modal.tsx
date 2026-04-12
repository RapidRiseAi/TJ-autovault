'use client';

import { ReactNode, useEffect } from 'react';

export function Modal({
  open,
  title,
  onClose,
  children,
  maxWidthClass
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] md:z-50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-black/10 bg-white p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:p-7 ${maxWidthClass ?? 'max-w-2xl'}`}>
        <div className="mb-5 flex items-center justify-between border-b border-black/10 pb-3">
          <h2 className="flex-1 text-center text-xl font-semibold text-black">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-black/15 px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-100"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
