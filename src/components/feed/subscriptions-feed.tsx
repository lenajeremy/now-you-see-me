'use client';

import Link from 'next/link';
import { useQuery } from 'convex/react';
import { Library } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { buttonVariants } from '@/components/ui/button';
import { VideoCard, VideoGrid, VideoGridSkeleton } from '@/components/video/video-card';
import { cn } from '@/lib/utils';

export function SubscriptionsFeed() {
  const channels = useQuery(api.channels.subscribed);
  const videos = useQuery(api.videos.subscriptionsFeed);

  if (channels === undefined || videos === undefined) return <VideoGridSkeleton />;
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed px-6 py-20 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-primary/10">
          <Library className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-medium">Your subscriptions live here</h1>
          <p className="mt-1 text-sm text-muted-foreground">Subscribe to channels you like and their newest 360° videos show up here.</p>
        </div>
        <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-5')}>
          Find channels
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Subscriptions</h1>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {channels.map((channel) => (
            <Link
              key={channel._id}
              href={`/@${channel.handle}`}
              className="flex shrink-0 items-center gap-2 rounded-full border bg-card/60 py-1 pr-4 pl-1 text-sm transition-colors hover:bg-muted"
            >
              <ChannelAvatar name={channel.name} imageUrl={channel.avatarUrl} className="size-7" />
              {channel.name}
            </Link>
          ))}
        </div>
      </div>
      {videos.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No videos from your subscriptions yet.</p>
      ) : (
        <VideoGrid>
          {videos.map((video) => (
            <VideoCard key={video._id} video={video} />
          ))}
        </VideoGrid>
      )}
    </div>
  );
}
