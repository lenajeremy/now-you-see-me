'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/** Loads the next page when it scrolls into view (paginated Convex queries). */
export function LoadMore({ status, onLoadMore }: { status: string; onLoadMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const load = useEffectEvent(() => onLoadMore());

  useEffect(() => {
    if (status !== 'CanLoadMore' || !ref.current) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && load(), {
      rootMargin: '800px 0px',
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [status]);

  return (
    <div ref={ref} className="flex h-16 items-center justify-center">
      {status === 'LoadingMore' ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}
