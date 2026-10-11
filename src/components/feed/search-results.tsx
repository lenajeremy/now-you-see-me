'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { SearchX } from 'lucide-react';
import { api } from '@convex/_generated/api';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoListItem } from '@/components/video/video-card';
import { SubscribeButton } from '@/components/watch/subscribe-button';
import { plural } from '@/lib/format';

export function SearchResults() {
  const q = useSearchParams().get('q')?.trim() ?? '';
  const videos = useQuery(api.videos.search, { text: q });
  const channels = useQuery(api.channels.search, { text: q });

  if (!q) {
    return <p className="py-16 text-center text-muted-foreground">Search for 360° videos and channels.</p>;
  }
  const loading = videos === undefined || channels === undefined;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold tracking-tight">
        Results for <span className="text-primary">“{q}”</span>
      </h1>
      {loading ? (
        <div className="flex flex-col gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-4 sm:flex-row">
              <Skeleton className="aspect-video rounded-xl sm:w-[360px]" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 && channels.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <p className="font-medium">Nothing matches “{q}”</p>
          <p className="text-sm text-muted-foreground">Try fewer or different words.</p>
        </div>
      ) : (
        <>
          {channels.length ? (
            <section className="flex flex-col gap-3">
              {channels.map((channel) => (
                <div key={channel._id} className="flex items-center gap-4 rounded-2xl border bg-card/50 p-4">
                  <Link href={`/@${channel.handle}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <ChannelAvatar name={channel.name} imageUrl={channel.avatarUrl} className="size-16 text-lg sm:size-20" />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-medium">{channel.name}</p>
                      <p className="text-sm text-muted-foreground">
                        @{channel.handle} · {plural(channel.subscriberCount, 'subscriber')} · {plural(channel.videoCount, 'video')}
                      </p>
                      {channel.description ? <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{channel.description}</p> : null}
                    </div>
                  </Link>
                  <ChannelSubscribe handle={channel.handle} />
                </div>
              ))}
            </section>
          ) : null}
          <section className="flex flex-col gap-6">
            {videos.map((video) => (
              <VideoListItem key={video._id} video={video} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/** Subscribe straight from the results, knowing whether you already are. */
function ChannelSubscribe({ handle }: { handle: string }) {
  const data = useQuery(api.channels.byHandle, { handle });
  if (!data) return null;
  return <SubscribeButton channelId={data.channel._id} subscribed={data.isSubscribed} isOwner={data.isOwner} className="shrink-0" />;
}
