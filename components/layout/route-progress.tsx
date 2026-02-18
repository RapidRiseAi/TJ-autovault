'use client';

import { useEffect, useRef, useState } from 'react';

export function RouteProgress() {
  const [loading, setLoading] = useState(false);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearStopTimer() {
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
    }

    function start() {
      clearStopTimer();
      setLoading(true);
    }

    function stop(delay = 140) {
      clearStopTimer();
      stopTimerRef.current = window.setTimeout(() => {
        setLoading(false);
        stopTimerRef.current = null;
      }, delay);
    }

    function onMaybeNavigate(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;

      const nextUrl = new URL(href, window.location.origin);
      if (
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search
      ) {
        return;
      }

      start();
    }

    const rawPushState = window.history.pushState.bind(window.history);
    const rawReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function patchedPushState(...args) {
      const result = rawPushState(...args);
      stop();
      return result;
    };

    window.history.replaceState = function patchedReplaceState(...args) {
      const result = rawReplaceState(...args);
      stop();
      return result;
    };

    function onPopState() {
      stop();
    }

    window.addEventListener('route-progress:start', start);
    document.addEventListener('click', onMaybeNavigate);
    window.addEventListener('popstate', onPopState);

    return () => {
      clearStopTimer();
      window.history.pushState = rawPushState;
      window.history.replaceState = rawReplaceState;
      window.removeEventListener('route-progress:start', start);
      document.removeEventListener('click', onMaybeNavigate);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

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
