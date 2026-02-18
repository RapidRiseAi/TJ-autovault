'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function RouteProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onStart() {
      setLoading(true);
    }

    function onMaybeNavigate(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (href.startsWith('http') && !href.startsWith(window.location.origin))
        return;
      const nextUrl = new URL(href, window.location.origin);
      if (
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search
      ) {
        return;
      }
      setLoading(true);
    }

    window.addEventListener('route-progress:start', onStart);
    document.addEventListener('click', onMaybeNavigate);
    return () => {
      window.removeEventListener('route-progress:start', onStart);
      document.removeEventListener('click', onMaybeNavigate);
    };
  }, []);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[130] h-[2px] overflow-hidden">
      <div
        className={`h-full bg-brand-red transition-all duration-300 ${
          loading
            ? 'w-full opacity-100 animate-[route-progress_1.1s_ease-in-out_infinite]'
            : 'w-0 opacity-0'
        }`}
      />
    </div>
  );
}
