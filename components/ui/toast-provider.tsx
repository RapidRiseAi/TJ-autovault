'use client';

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

type ToastTone = 'success' | 'error';

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (payload: Omit<ToastItem, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (payload: Omit<ToastItem, 'id'>) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { ...payload, id }]);
      window.setTimeout(() => removeToast(id), 3800);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((toast) => {
          const isSuccess = toast.tone === 'success';
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl border px-3 py-2 shadow-lg backdrop-blur ${
                isSuccess
                  ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                  : 'border-red-200 bg-red-50/95 text-red-900'
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                {isSuccess ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.description ? (
                    <p className="text-xs opacity-80">{toast.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="rounded p-1 hover:bg-black/5"
                  aria-label="Dismiss toast"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
