'use client';

import Link from 'next/link';
import { usePaginatedQuery } from 'convex/react';
import { Eye, Orbit, Play, Upload, Users } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PanoThumb } from '@/components/video/pano-thumb';
import { VideoCard, VideoGrid, VideoGridSkeleton, type VideoSummary } from '@/components/video/video-card';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LoadMore } from './load-more';

export function HomeFeed() {
  const { results, status, loadMore } = usePaginatedQuery(api.videos.feed, {}, { initialNumItems: 24 });

  if (status === 'LoadingFirstPage') {
    return (
      <div className="flex flex-col gap-10">
        <Skeleton className="aspect-[4/3] rounded-2xl sm:aspect-[21/9]" />
        <VideoGridSkeleton />
      </div>
    );
  }
  if (results.length === 0) return <Welcome />;

  const [featured] = results;
  return (
    <div className="flex flex-col gap-10">
      <Featured video={featured!} />
      <section className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold tracking-tight">Latest</h2>
        <VideoGrid>
          {results.map((video) => (
            <VideoCard key={video._id} video={video} />
          ))}
        </VideoGrid>
        <LoadMore status={status} onLoadMore={() => loadMore(24)} />
      </section>
    </div>
  );
}

/** The newest video, big, turning slowly. */
function Featured({ video }: { video: VideoSummary }) {
  return (
    <section className="relative overflow-hidden rounded-2xl ring-1 ring-white/10">
      <PanoThumb
        playbackId={video.playbackId}
        time={video.thumbnailTime}
        facing={video.facing}
        width={2560}
        autoPan
        period={90}
        className="aspect-[4/3] sm:aspect-[21/9]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent sm:bg-gradient-to-r sm:from-black/80 sm:via-black/30" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-4 p-5 sm:max-w-xl sm:p-8">
        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
          <Orbit className="size-3.5" /> Newest in 360°
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-white sm:text-4xl">{video.title}</h1>
        {video.channel ? (
          <Link href={`/@${video.channel.handle}`} className="flex items-center gap-2 text-sm text-white/80 hover:text-white">
            <ChannelAvatar name={video.channel.name} imageUrl={video.channel.avatarUrl} className="size-6" />
            {video.channel.name}
            <span className="text-white/50">· {plural(video.viewCount, 'view')}</span>
          </Link>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href={`/watch/${video._id}`} className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-5')}>
            <Play className="fill-current" /> Step inside
          </Link>
          <Link
            href="/studio/upload"
            className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'rounded-full border-white/20 bg-white/5 px-5 text-white backdrop-blur-md hover:bg-white/15')}
          >
            <Upload /> Upload yours
          </Link>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Orbit, title: 'Look all the way round', text: 'Drag, swipe or turn your phone. Every video is a place, not a frame.' },
  { icon: Eye, title: 'See yourself in it', text: 'Step outside and watch yourself standing in the scene, side by side.' },
  { icon: Users, title: 'Watch together', text: 'Call a friend from any video and stand in it together, in sync.' },
];

/** The home page before anyone has uploaded. */
function Welcome() {
  return (
    <section className="relative overflow-hidden rounded-3xl border bg-[radial-gradient(120%_80%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_70%)] px-6 py-16 text-center sm:py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
        <span className="flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Orbit className="size-3.5 text-primary" /> 360° video only
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Video you can stand inside</h1>
        <p className="max-w-lg text-lg text-pretty text-muted-foreground">
          Upload 360° video and anyone can look around inside it, step outside to see themselves there, or call a friend in.
        </p>
        <Link href="/studio/upload" className={cn(buttonVariants({ size: 'lg' }), 'mt-1 h-11 rounded-full px-6')}>
          <Upload /> Upload the first video
        </Link>
      </div>
      <div className="mx-auto mt-14 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border bg-card/60 p-5">
            <Icon className="size-5 text-primary" />
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
