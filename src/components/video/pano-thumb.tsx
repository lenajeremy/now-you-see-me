import type { CSSProperties, ReactNode } from 'react';
import { Orbit } from 'lucide-react';
import { thumbnailUrl } from '@/lib/mux';
import { cn } from '@/lib/utils';

/** How many frame widths the whole panorama spans: about 140° of it is in view. */
const SPAN = 2.57;

export interface PanoThumbProps {
  playbackId?: string;
  /** Second of the video to show. */
  time?: number;
  /** How far across the panorama (0–1) the middle of the frame is. */
  facing?: number;
  /** Width of the image to fetch. */
  width?: number;
  /** Turn even without hovering (heroes, banners). */
  autoPan?: boolean;
  /** Seconds for one full turn. */
  period?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * A 360° video's thumbnail: the part of the panorama in front of you, which
 * turns slowly when you hover over the card (anything with the `group` class).
 */
export function PanoThumb({ playbackId, time, facing = 0.5, width = 1280, autoPan, period, className, children }: PanoThumbProps) {
  const start = (((facing * SPAN - 0.5) % SPAN) + SPAN) % SPAN;
  const style = { '--pano-start': start, ...(period ? { '--pano-period': `${period}s` } : {}) } as CSSProperties;
  return (
    <div
      className={cn('pano relative aspect-video overflow-hidden bg-muted', className)}
      style={style}
      data-autopan={autoPan || undefined}
    >
      {playbackId ? (
        <div className="pano-strip" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            // eslint-disable-next-line @next/next/no-img-element -- Mux serves these already sized; three copies make the wrap.
            <img key={i} src={thumbnailUrl(playbackId, { time, width })} alt="" loading="lazy" decoding="async" draggable={false} />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,var(--color-muted),var(--color-background))]">
          <Orbit className="size-8 text-muted-foreground/60" />
        </div>
      )}
      {children}
    </div>
  );
}
