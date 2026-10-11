'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  Heart,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Doc } from '@convex/_generated/dataModel';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { CreateChannel } from '@/components/channel/create-channel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PanoThumb } from '@/components/video/pano-thumb';
import { useMe } from '@/hooks/use-me';
import { errorMessage } from '@/lib/errors';
import { formatCount, formatDate, formatDuration } from '@/lib/format';
import { useUpload } from '@/lib/upload-manager';
import { cn } from '@/lib/utils';
import { ChannelSettings } from './channel-settings';
import { EditVideoDialog } from './edit-video-dialog';
import { VISIBILITY, VISIBILITY_ORDER, type Visibility } from './visibility';

const VISIBILITY_ITEMS = VISIBILITY_ORDER.map((value) => ({ value, label: VISIBILITY[value].label }));

export function StudioView() {
  const me = useMe();
  const mine = useQuery(api.videos.mine, me.status === 'ready' ? {} : 'skip');

  if (me.status !== 'ready' || mine === undefined) return <StudioSkeleton />;
  if (!me.channel || !mine?.channel) {
    return (
      <div className="py-10">
        <CreateChannel />
      </div>
    );
  }
  return <Studio channel={mine.channel} videos={mine.videos} />;
}

function Studio({ channel, videos }: { channel: Doc<'channels'>; videos: Doc<'videos'>[] }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const totals = videos.reduce(
    (sum, v) => ({ views: sum.views + v.viewCount, likes: sum.likes + v.likeCount, comments: sum.comments + v.commentCount }),
    { views: 0, likes: 0, comments: 0 },
  );
  const stats = [
    { label: 'Subscribers', value: channel.subscriberCount, icon: Users },
    { label: 'Videos', value: videos.length, icon: Video },
    { label: 'Views', value: totals.views, icon: Eye },
    { label: 'Likes', value: totals.likes, icon: Heart },
    { label: 'Comments', value: totals.comments, icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ChannelAvatar name={channel.name} imageUrl={channel.avatarUrl} className="size-14 text-lg" />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Studio</p>
              <h1 className="truncate text-xl font-semibold tracking-tight">{channel.name}</h1>
              <Link href={`/@${channel.handle}`} className="text-sm text-muted-foreground hover:text-foreground">
                @{channel.handle}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" className="rounded-full px-4" onClick={() => setSettingsOpen(true)}>
              <Pencil /> Customize channel
            </Button>
            <Link href="/studio/upload" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-4')}>
              <Upload /> Upload
            </Link>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex flex-col gap-1 bg-card p-4">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" /> {label}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">{formatCount(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Your videos</h2>
        {videos.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-primary/10">
              <Upload className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">No videos yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Upload your first 360° video and it’ll show up here.</p>
            </div>
            <Link href="/studio/upload" className={cn(buttonVariants({ size: 'lg' }), 'rounded-full px-5')}>
              Upload a video
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[320px] pl-4">Video</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Comments</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Likes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video) => (
                  <VideoRow key={video._id} video={video} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <ChannelSettings channel={channel} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function VideoRow({ video }: { video: Doc<'videos'> }) {
  const update = useMutation(api.videos.update);
  const remove = useMutation(api.videos.remove);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ready = video.status === 'ready';

  async function changeVisibility(visibility: Visibility) {
    try {
      await update({ id: video._id, visibility });
      toast.success(`Now ${VISIBILITY[visibility].label.toLowerCase()}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/watch/${video._id}`);
    toast.success('Link copied');
  }

  return (
    <TableRow className="group">
      <TableCell className="py-3 pl-4">
        <div className="flex items-center gap-3">
          <button type="button" className="relative w-32 shrink-0 overflow-hidden rounded-lg" onClick={() => setEditing(true)}>
            <PanoThumb playbackId={ready ? video.playbackId : undefined} time={video.thumbnailTime} facing={video.facing} width={480}>
              {video.duration ? (
                <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white tabular-nums">
                  {formatDuration(video.duration)}
                </span>
              ) : null}
            </PanoThumb>
          </button>
          <div className="min-w-0 max-w-sm">
            <button type="button" onClick={() => setEditing(true)} className="line-clamp-1 text-left font-medium hover:underline">
              {video.title}
            </button>
            <p className="line-clamp-2 text-xs whitespace-normal text-muted-foreground">
              {video.description || 'No description'}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={video.visibility}
          items={VISIBILITY_ITEMS}
          onValueChange={(value) => value && void changeVisibility(value as Visibility)}
        >
          <SelectTrigger size="sm" className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_ORDER.map((value) => {
              const { label, icon: Icon } = VISIBILITY[value];
              return (
                <SelectItem key={value} value={value}>
                  <Icon /> {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Status video={video} />
      </TableCell>
      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatDate(video._creationTime)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCount(video.viewCount)}</TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCount(video.commentCount)}</TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCount(video.likeCount)}</TableCell>
      <TableCell className="pr-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil /> Edit details
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/watch/${video._id}`} />} disabled={!ready}>
              <Play /> Watch
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyLink} disabled={!ready}>
              <Link2 /> Copy link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <EditVideoDialog video={video} open={editing} onOpenChange={setEditing} />
        <AlertDialog open={deleting} onOpenChange={setDeleting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{video.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This can’t be undone. The video, its views, likes and comments are gone for good.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={async () => {
                  setDeleting(false);
                  try {
                    await remove({ id: video._id });
                    toast.success('Video deleted');
                  } catch (error) {
                    toast.error(errorMessage(error));
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

/** Where a video is between upload and published, in a word or two. */
function Status({ video }: { video: Doc<'videos'> }) {
  const upload = useUpload(video._id);
  if (video.status === 'uploading') {
    if (upload && (upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'offline')) {
      return (
        <div className="flex w-28 flex-col gap-1.5">
          <span className="text-xs tabular-nums">
            {upload.status === 'uploading' ? `Uploading ${Math.floor(upload.percent)}%` : upload.status === 'paused' ? 'Paused' : 'Offline'}
          </span>
          <Progress value={upload.percent} />
        </div>
      );
    }
    return <Pill tone="muted">Waiting for upload</Pill>;
  }
  if (video.status === 'processing') {
    return (
      <Pill tone="muted">
        <Loader2 className="size-3 animate-spin" /> Processing
      </Pill>
    );
  }
  if (video.status === 'errored' || video.status === 'rejected') {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Pill tone="bad">
            <AlertTriangle className="size-3" /> {video.status === 'rejected' ? 'Not 360°' : 'Failed'}
          </Pill>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{video.statusMessage}</TooltipContent>
      </Tooltip>
    );
  }
  if (video.visibility === 'public') {
    return (
      <Link href={`/watch/${video._id}`}>
        <Pill tone="good">
          Live <ExternalLink className="size-3" />
        </Pill>
      </Link>
    );
  }
  return <Pill tone="muted">Ready</Pill>;
}

function Pill({ tone, children }: { tone: 'good' | 'bad' | 'muted'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        tone === 'good' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'bad' && 'bg-destructive/15 text-destructive',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {tone === 'good' ? <span className="size-1.5 rounded-full bg-emerald-400" /> : null}
      {children}
    </span>
  );
}

function StudioSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
