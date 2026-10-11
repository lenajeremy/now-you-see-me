'use client';

import Link from 'next/link';
import { useQuery } from 'convex/react';
import { CalendarDays, Eye, Orbit, Pencil, Upload, Users, Video } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PanoThumb } from '@/components/video/pano-thumb';
import { VideoCard, VideoGrid, VideoGridSkeleton } from '@/components/video/video-card';
import { SubscribeButton } from '@/components/watch/subscribe-button';
import { formatCount, formatDate, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChannelAvatar } from './channel-avatar';

export function ChannelView({ handle }: { handle: string }) {
  const data = useQuery(api.channels.byHandle, { handle: decodeURIComponent(handle).replace(/^@/, '') });
  const videos = useQuery(api.videos.byChannel, data ? { channelId: data.channel._id } : 'skip');

  if (data === undefined) return <ChannelSkeleton />;
  if (data === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <Orbit className="size-9 text-muted-foreground" />
        <h1 className="text-lg font-medium">This channel doesn’t exist</h1>
        <p className="text-sm text-muted-foreground">Check the handle, or find channels with search.</p>
        <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'mt-2 rounded-full px-5')}>
          Back home
        </Link>
      </div>
    );
  }

  const { channel, cover, isOwner, isSubscribed } = data;
  const views = videos?.reduce((sum, v) => sum + v.viewCount, 0) ?? 0;
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
        {channel.bannerUrl ? (
          <div className="aspect-[3/1] bg-cover bg-center sm:aspect-[6/1]" style={{ backgroundImage: `url(${channel.bannerUrl})` }} />
        ) : cover ? (
          <PanoThumb
            playbackId={cover.playbackId}
            time={cover.thumbnailTime}
            facing={cover.facing}
            width={2560}
            autoPan
            period={120}
            className="aspect-[3/1] sm:aspect-[6/1]"
          />
        ) : (
          <div className="aspect-[3/1] bg-[radial-gradient(120%_120%_at_20%_0%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent_60%),linear-gradient(to_right,var(--color-muted),var(--color-card))] sm:aspect-[6/1]" />
        )}
      </div>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ChannelAvatar name={channel.name} imageUrl={channel.avatarUrl} className="size-24 text-2xl sm:size-32 sm:text-3xl" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">{channel.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">@{channel.handle}</span> · {plural(channel.subscriberCount, 'subscriber')} ·{' '}
            {plural(channel.videoCount, 'video')}
          </p>
          {channel.description ? <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">{channel.description}</p> : null}
          <div className="mt-1 flex flex-wrap gap-2">
            {isOwner ? (
              <>
                <Link href="/studio" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'rounded-full px-4')}>
                  <Pencil /> Customize channel
                </Link>
                <Link href="/studio/upload" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-4')}>
                  <Upload /> Upload
                </Link>
              </>
            ) : (
              <SubscribeButton channelId={channel._id} subscribed={isSubscribed} isOwner={false} />
            )}
          </div>
        </div>
      </header>

      <Tabs defaultValue="videos" className="gap-6">
        <TabsList variant="line" className="w-full justify-start gap-4 border-b pb-1">
          <TabsTrigger value="videos" className="flex-none px-1">
            Videos
          </TabsTrigger>
          <TabsTrigger value="about" className="flex-none px-1">
            About
          </TabsTrigger>
        </TabsList>
        <TabsContent value="videos">
          {videos === undefined ? (
            <VideoGridSkeleton count={4} />
          ) : videos.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
              <Video className="size-7 text-muted-foreground" />
              <p className="font-medium">{isOwner ? 'Your videos will show up here' : 'No videos yet'}</p>
              {isOwner ? (
                <Link href="/studio/upload" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-5')}>
                  Upload a 360° video
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Subscribe to see their first one when it lands.</p>
              )}
            </div>
          ) : (
            <VideoGrid>
              {videos.map((video) => (
                <VideoCard key={video._id} video={video} />
              ))}
            </VideoGrid>
          )}
        </TabsContent>
        <TabsContent value="about">
          <div className="grid max-w-4xl gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <h2 className="font-semibold">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{channel.description || 'No description yet.'}</p>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4" /> Joined {formatDate(channel._creationTime)}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="size-4" /> {plural(channel.subscriberCount, 'subscriber')}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Eye className="size-4" /> {formatCount(views)} views
              </div>
            </dl>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChannelSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-4 sm:px-6">
      <Skeleton className="aspect-[3/1] rounded-2xl sm:aspect-[6/1]" />
      <div className="flex items-center gap-5">
        <Skeleton className="size-24 rounded-full sm:size-32" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <VideoGridSkeleton count={4} />
    </div>
  );
}
