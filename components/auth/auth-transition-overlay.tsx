'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function AuthTransitionOverlay() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function onStart(event: Event) {
      const customEvent = event as CustomEvent<{ message?: string }>;
      setMessage(customEvent.detail?.message ?? 'Please wait...');
    }

    function onEnd() {
      setMessage(null);
    }

    window.addEventListener('auth-transition:start', onStart as EventListener);
    window.addEventListener('auth-transition:end', onEnd);

    return () => {
      window.removeEventListener('auth-transition:start', onStart as EventListener);
      window.removeEventListener('auth-transition:end', onEnd);
    };
  }, []);

  useEffect(() => {
    setMessage(null);
  }, [pathname]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/90 px-5 py-3 shadow-xl">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-brand-red"
          aria-hidden
        />
        <p className="text-sm font-medium text-gray-700">{message}</p>
      </div>
    </div>
  );
}
