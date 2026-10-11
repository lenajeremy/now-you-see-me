'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { SignInButton, useAuth } from '@clerk/nextjs';
import { Flag, Heart, Loader2, MoreHorizontal, Orbit, Pencil, Share2, Users, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { LinkifiedText } from '@/components/linkified-text';
import { WorldPlayer } from '@/components/player/world-player';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoRow } from '@/components/video/video-card';
import { errorMessage } from '@/lib/errors';
import { formatCount, formatDate, plural, timeAgo } from '@/lib/format';
import { streamUrl } from '@/lib/mux';
import { cn } from '@/lib/utils';
import { Comments } from './comments';
import { ReportDialog } from './report-dialog';
import { ShareDialog } from './share-dialog';
import { SubscribeButton } from './subscribe-button';
import { useToggleLike } from './use-social';
import { PartyBar } from './party/party-bar';
import type { PartyController } from './party/party-controller';
import { SelfView } from './party/self-view';
import { useParty } from './party/use-party';
import { useMe } from '@/hooks/use-me';
import type { WorldEngine } from '@/world/engine';

/** Seconds someone must watch before it counts as a view. */
const VIEW_AFTER = 10;

export function WatchView({ id }: { id: string }) {
  const data = useQuery(api.videos.get, { id });

  return (
    <div className="mx-auto grid w-full max-w-[1800px] gap-8 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-6">
        {data === undefined ? <MainSkeleton /> : data === null ? <Unavailable /> : <Main data={data} />}
      </div>
      <aside className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Up next</h2>
        <UpNext excludeId={id} />
      </aside>
    </div>
  );
}

type WatchData = NonNullable<FunctionReturnType<typeof api.videos.get>>;

function Main({ data }: { data: WatchData }) {
  const { video, channel, isOwner, liked, subscribed } = data;
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const recordView = useMutation(api.videos.recordView);
  const counted = useRef<string | null>(null);

  // Watching together: ?party=… in the address. Joining needs a click (camera, sound),
  // except for whoever just started it here.
  const pathname = usePathname();
  const partyParam = useSearchParams().get('party');
  const me = useMe();
  const [accepted, setAccepted] = useState<string | null>(null);
  const [autoPlay] = useState(() => !partyParam);
  const party = useParty(
    partyParam as Id<'parties'> | null,
    me.status === 'ready' ? me.user._id : null,
    !!partyParam && accepted === partyParam,
  );
  const player = useRef<{ engine: WorldEngine; video: HTMLVideoElement } | null>(null);
  const partyRef = useRef<PartyController | null>(null);
  useEffect(() => {
    partyRef.current = party;
    if (party && player.current) party.attach(player.current.engine, player.current.video);
  }, [party]);

  // The address changes in place: no navigation, so the player and the party carry on.
  const leaveParty = useCallback(() => {
    setAccepted(null);
    window.history.replaceState(null, '', pathname);
  }, [pathname]);

  const onReady = useCallback(
    (engine: WorldEngine, element: HTMLVideoElement) => {
      player.current = { engine, video: element };
      partyRef.current?.attach(engine, element);
      // Count a view once someone has actually watched for a few seconds.
      let watched = 0;
      let last = element.currentTime;
      const onTime = () => {
        const step = element.currentTime - last;
        last = element.currentTime;
        if (step > 0 && step < 1.5) watched += step;
        const needed = Math.min(VIEW_AFTER, (element.duration || VIEW_AFTER) * 0.5);
        if (watched >= needed && counted.current !== video._id) {
          counted.current = video._id;
          void recordView({ id: video._id });
          element.removeEventListener('timeupdate', onTime);
        }
      };
      element.addEventListener('timeupdate', onTime);
    },
    [video._id, recordView],
  );

  const inviteUrl = typeof window === 'undefined' || !partyParam ? '' : `${window.location.origin}/watch/${video._id}?party=${partyParam}`;

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
        {video.status === 'ready' && video.playbackId ? (
          <WorldPlayer
            key={video._id}
            src={streamUrl(video.playbackId)}
            facing={video.facing}
            autoPlay={autoPlay}
            loop={false}
            screenToggle={!!party}
            onReady={onReady}
            className="aspect-video w-full"
          >
            {party ? <SelfView stream={party.local} cameraOn={party.call?.localMedia.video ?? true} /> : null}
            {partyParam && accepted !== partyParam ? (
              <PartyGate partyId={partyParam} onJoin={() => setAccepted(partyParam)} onDismiss={leaveParty} />
            ) : null}
          </WorldPlayer>
        ) : (
          <NotReady status={video.status} message={video.statusMessage} />
        )}
      </div>

      {party ? <PartyBar party={party} inviteUrl={inviteUrl} onLeave={leaveParty} /> : null}

      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{video.title}</h1>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/@${channel.handle}`}>
              <ChannelAvatar name={channel.name} imageUrl={channel.avatarUrl} className="size-10" />
            </Link>
            <div className="mr-2 min-w-0">
              <Link href={`/@${channel.handle}`} className="block truncate font-medium hover:underline">
                {channel.name}
              </Link>
              <p className="text-xs text-muted-foreground">{plural(channel.subscriberCount, 'subscriber')}</p>
            </div>
            <SubscribeButton channelId={channel._id} subscribed={subscribed} isOwner={isOwner} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!partyParam && video.status === 'ready' ? (
              <WatchTogetherButton
                videoId={video._id}
                onStarted={(partyId) => {
                  setAccepted(partyId);
                  window.history.replaceState(null, '', `${pathname}?party=${partyId}`);
                }}
              />
            ) : null}
            <LikeButton videoId={video._id} liked={liked} count={video.likeCount} />
            <Button variant="secondary" size="lg" className="rounded-full px-4" onClick={() => setSharing(true)}>
              <Share2 /> Share
            </Button>
            {isOwner ? (
              <Link href="/studio" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'rounded-full px-4')}>
                <Pencil /> Edit
              </Link>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="secondary" size="icon-lg" className="rounded-full" aria-label="More" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <ReportItem onReport={() => setReporting(true)} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Description
        views={video.viewCount}
        published={video.publishedAt ?? video._creationTime}
        text={video.description}
        visibility={video.visibility}
      />

      <Comments videoId={video._id} count={video.commentCount} />

      <ShareDialog title={video.title} path={`/watch/${video._id}`} open={sharing} onOpenChange={setSharing} />
      <ReportDialog target={{ type: 'video', id: video._id }} open={reporting} onOpenChange={setReporting} />
    </>
  );
}

/** Starts a watch party for this video. */
function WatchTogetherButton({ videoId, onStarted }: { videoId: Id<'videos'>; onStarted: (partyId: string) => void }) {
  const { isSignedIn } = useAuth();
  const create = useMutation(api.parties.create);
  const [starting, setStarting] = useState(false);
  const button = (
    <Button
      size="lg"
      className="rounded-full px-4"
      disabled={starting}
      onClick={
        isSignedIn
          ? async () => {
              setStarting(true);
              try {
                onStarted(await create({ videoId }));
              } catch (error) {
                toast.error(errorMessage(error));
              } finally {
                setStarting(false);
              }
            }
          : undefined
      }
    >
      {starting ? <Loader2 className="animate-spin" /> : <Users />} Watch together
    </Button>
  );
  return isSignedIn ? button : <SignInButton mode="modal">{button}</SignInButton>;
}

/** Over the player for someone arriving from an invite link: who invited them, and Join. */
function PartyGate({ partyId, onJoin, onDismiss }: { partyId: string; onJoin: () => void; onDismiss: () => void }) {
  const { isSignedIn } = useAuth();
  const party = useQuery(api.parties.get, { partyId });
  const join = (
    <Button size="lg" className="h-10 rounded-full px-5" onClick={isSignedIn ? onJoin : undefined}>
      <Users /> Join with camera and mic
    </Button>
  );
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4 backdrop-blur-md" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex max-w-sm flex-col items-center gap-4 text-center text-white">
        {party === undefined ? (
          <Loader2 className="size-7 animate-spin text-white/70" />
        ) : party === null ? (
          <>
            <p className="text-lg font-medium">This watch party has ended</p>
            <Button size="lg" variant="secondary" className="rounded-full px-5" onClick={onDismiss}>
              Watch on your own
            </Button>
          </>
        ) : (
          <>
            <ChannelAvatar name={party.host.name} imageUrl={party.host.imageUrl} className="size-14 text-lg ring-2 ring-white/20" />
            <div>
              <p className="text-lg font-medium">{party.host.name} invited you to watch together</p>
              <p className="mt-1 text-sm text-white/70">
                You’ll be in the same 360° video at the same moment, and see each other on a screen inside it.
              </p>
            </div>
            {isSignedIn ? join : <SignInButton mode="modal">{join}</SignInButton>}
            <button type="button" onClick={onDismiss} className="text-sm text-white/60 hover:text-white">
              Watch on your own instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ReportItem({ onReport }: { onReport: () => void }) {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <DropdownMenuItem>
          <Flag /> Report
        </DropdownMenuItem>
      </SignInButton>
    );
  }
  return (
    <DropdownMenuItem onClick={onReport}>
      <Flag /> Report
    </DropdownMenuItem>
  );
}

function LikeButton({ videoId, liked, count }: { videoId: Id<'videos'>; liked: boolean; count: number }) {
  const { isSignedIn } = useAuth();
  const toggle = useToggleLike();
  const button = (
    <Button
      variant="secondary"
      size="lg"
      className={cn('rounded-full px-4 tabular-nums', liked && 'bg-primary/15 text-primary hover:bg-primary/25')}
      aria-pressed={liked}
      onClick={isSignedIn ? () => toggle({ videoId }).catch((error) => toast.error(errorMessage(error))) : undefined}
    >
      <Heart className={cn(liked && 'fill-current')} /> {count ? formatCount(count) : 'Like'}
    </Button>
  );
  return isSignedIn ? button : <SignInButton mode="modal">{button}</SignInButton>;
}

function Description({
  views,
  published,
  text,
  visibility,
}: {
  views: number;
  published: number;
  text: string;
  visibility: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 3;
  return (
    <div className="rounded-xl bg-muted/60 p-4 text-sm">
      <p className="font-medium">
        {plural(views, 'view')} · <span title={formatDate(published)}>{timeAgo(published)}</span>
        {visibility !== 'public' ? <span className="ml-2 text-muted-foreground capitalize">· {visibility}</span> : null}
      </p>
      {text ? (
        <p className={cn('mt-2 whitespace-pre-wrap break-words text-foreground/90', !open && long && 'line-clamp-3')}>
          <LinkifiedText text={text} />
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">Drag the video to look around. Use the views at the bottom right to see yourself in the scene.</p>
      )}
      {long ? (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 font-medium hover:underline">
          {open ? 'Show less' : '…more'}
        </button>
      ) : null}
    </div>
  );
}

function UpNext({ excludeId }: { excludeId: string }) {
  const videos = useQuery(api.videos.upNext, { excludeId });
  if (videos === undefined) {
    return Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="flex gap-3 p-1">
        <Skeleton className="aspect-video w-40 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2 py-1">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    ));
  }
  if (videos.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">More 360° videos will show up here.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {videos.map((video) => (
        <VideoRow key={video._id} video={video} />
      ))}
    </div>
  );
}

/** For the owner, while their video is still on its way. */
function NotReady({ status, message }: { status: string; message?: string }) {
  const failed = status === 'errored' || status === 'rejected';
  return (
    <div className="grid aspect-video place-items-center bg-[radial-gradient(ellipse_at_center,var(--color-muted),#000)] p-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        {failed ? <VideoOff className="size-9 text-destructive" /> : <Loader2 className="size-9 animate-spin text-primary" />}
        <p className="font-medium text-white">
          {status === 'uploading' ? 'Still uploading…' : status === 'processing' ? 'Processing your 360° video…' : 'This video can’t be played'}
        </p>
        <p className="text-sm text-white/60">
          {failed ? message : 'Only you can see this page until it’s ready. It usually takes a few minutes.'}
        </p>
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="grid aspect-video place-items-center rounded-xl border bg-card p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <Orbit className="size-9 text-muted-foreground" />
        <p className="text-lg font-medium">This video isn’t available</p>
        <p className="text-sm text-muted-foreground">It may have been deleted or made private, or the link isn’t quite right.</p>
        <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'mt-2 rounded-full px-5')}>
          Back home
        </Link>
      </div>
    </div>
  );
}

function MainSkeleton() {
  return (
    <>
      <Skeleton className="aspect-video rounded-xl" />
      <Skeleton className="h-7 w-2/3" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
    </>
  );
}
