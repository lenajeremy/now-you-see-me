import Link from 'next/link';
import { cn } from '@/lib/utils';

/** The mark: an eye inside a 360° ring. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M16 3a13 13 0 0 1 12.6 9.8" fill="none" stroke="var(--color-primary)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M29 9.5l-.4 3.3-3.1-1.2" fill="none" stroke="var(--color-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 16s2.8-4.6 7.5-4.6 7.5 4.6 7.5 4.6-2.8 4.6-7.5 4.6S8.5 16 8.5 16z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <BrandMark />
      <span className="text-[15px]">Now You See Me</span>
    </Link>
  );
}
