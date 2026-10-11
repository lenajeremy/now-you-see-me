import Link from 'next/link';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@convex/_generated/api';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration, plural, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PanoThumb } from './pano-thumb';

/** A video as feeds list it, with its channel. */
export type VideoSummary = FunctionReturnType<typeof api.videos.feed>['page'][number];

function ThumbBadges({ duration }: { duration?: number }) {
  return (
    <>
      <span className="absolute top-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white backdrop-blur-sm">
        360°
      </span>
      {duration ? (
        <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
          {formatDuration(duration)}
        </span>
      ) : null}
    </>
  );
}

function meta(video: VideoSummary): string {
  return `${plural(video.viewCount, 'view')} · ${timeAgo(video.publishedAt ?? video._creationTime)}`;
}

/** The home grid's card: the panorama, then who made it and how it's doing. */
export function VideoCard({ video }: { video: VideoSummary }) {
  const href = `/watch/${video._id}`;
  return (
    <article className="group flex flex-col gap-3">
      <Link href={href} className="block overflow-hidden rounded-xl ring-1 ring-white/5" aria-label={video.title}>
        <PanoThumb
          playbackId={video.playbackId}
          time={video.thumbnailTime}
          facing={video.facing}
          width={960}
          className="transition-transform duration-500 group-hover:scale-[1.02]"
        >
          <ThumbBadges duration={video.duration} />
        </PanoThumb>
      </Link>
      <div className="flex gap-3">
        {video.channel ? (
          <Link href={`/@${video.channel.handle}`} className="shrink-0" tabIndex={-1}>
            <ChannelAvatar name={video.channel.name} imageUrl={video.channel.avatarUrl} />
          </Link>
        ) : null}
        <div className="min-w-0">
          <Link href={href} className="line-clamp-2 font-medium leading-snug text-foreground">
            {video.title}
          </Link>
          {video.channel ? (
            <Link
              href={`/@${video.channel.handle}`}
              className="mt-1 block truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {video.channel.name}
            </Link>
          ) : null}
          <p className="text-sm text-muted-foreground">{meta(video)}</p>
        </div>
      </div>
    </article>
  );
}

/** A compact row for "Up next". */
export function VideoRow({ video }: { video: VideoSummary }) {
  return (
    <Link href={`/watch/${video._id}`} className="group flex gap-3 rounded-xl p-1 transition-colors hover:bg-muted/60">
      <PanoThumb
        playbackId={video.playbackId}
        time={video.thumbnailTime}
        facing={video.facing}
        width={480}
        className="w-40 shrink-0 rounded-lg"
      >
        <ThumbBadges duration={video.duration} />
      </PanoThumb>
      <div className="min-w-0 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</p>
        {video.channel ? <p className="mt-1 truncate text-xs text-muted-foreground">{video.channel.name}</p> : null}
        <p className="text-xs text-muted-foreground">{meta(video)}</p>
      </div>
    </Link>
  );
}

/** A wide row for search results: big panorama on the left, details on the right. */
export function VideoListItem({ video }: { video: VideoSummary }) {
  const href = `/watch/${video._id}`;
  return (
    <article className="group flex flex-col gap-4 sm:flex-row">
      <Link href={href} className="block shrink-0 overflow-hidden rounded-xl ring-1 ring-white/5 sm:w-[360px]" aria-label={video.title}>
        <PanoThumb playbackId={video.playbackId} time={video.thumbnailTime} facing={video.facing} width={960}>
          <ThumbBadges duration={video.duration} />
        </PanoThumb>
      </Link>
      <div className="min-w-0 py-1">
        <Link href={href} className="line-clamp-2 text-lg font-medium leading-snug">
          {video.title}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{meta(video)}</p>
        {video.channel ? (
          <Link href={`/@${video.channel.handle}`} className="mt-3 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChannelAvatar name={video.channel.name} imageUrl={video.channel.avatarUrl} className="size-6" />
            {video.channel.name}
          </Link>
        ) : null}
        {video.description ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{video.description}</p> : null}
      </div>
    </article>
  );
}

export function VideoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-x-4 gap-y-9 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4', className)}>{children}</div>;
}

export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-video rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-0.5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <VideoGrid>
      {Array.from({ length: count }, (_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </VideoGrid>
  );
}
