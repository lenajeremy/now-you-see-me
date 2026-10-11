'use client';

import { useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { SignInButton, useAuth, useUser } from '@clerk/nextjs';
import { ArrowUp, Flag, Loader2, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { LinkifiedText } from '@/components/linkified-text';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/errors';
import { formatCount, timeAgo } from '@/lib/format';
import { ReportDialog } from './report-dialog';

/** Comments on a video, newest first, with a box to add yours. */
export function Comments({ videoId, count }: { videoId: Id<'videos'>; count: number }) {
  const { results, status, loadMore } = usePaginatedQuery(api.social.comments, { videoId }, { initialNumItems: 20 });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="text-lg font-semibold tracking-tight">
        Comments <span className="text-muted-foreground">{formatCount(count)}</span>
      </h2>
      <Composer videoId={videoId} />
      {status === 'LoadingFirstPage' ? (
        <div className="flex flex-col gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-10 w-2/3 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-10 text-center">
          <MessageSquare className="size-6 text-muted-foreground" />
          <p className="font-medium">No comments yet</p>
          <p className="text-sm text-muted-foreground">Start the conversation — what did you spot in there?</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-5">
          {results.map((comment) => (
            <Comment key={comment._id} comment={comment} />
          ))}
        </ol>
      )}
      {status === 'CanLoadMore' || status === 'LoadingMore' ? (
        <Button variant="outline" className="self-start rounded-full" onClick={() => loadMore(20)} disabled={status === 'LoadingMore'}>
          {status === 'LoadingMore' ? <Loader2 className="animate-spin" /> : null} Show more comments
        </Button>
      ) : null}
    </section>
  );
}

function Composer({ videoId }: { videoId: Id<'videos'> }) {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const add = useMutation(api.social.addComment);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card/60 p-4">
        <p className="text-sm text-muted-foreground">Sign in to join the conversation.</p>
        <SignInButton mode="modal">
          <Button variant="outline" className="rounded-full">
            Sign in
          </Button>
        </SignInButton>
      </div>
    );
  }

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await add({ videoId, body });
      setBody('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="flex gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <ChannelAvatar name={user?.fullName ?? 'You'} imageUrl={user?.imageUrl} className="mt-1" />
      <div className="relative flex-1 rounded-2xl border bg-card/60 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Leave a comment…"
          rows={2}
          className="field-sizing-content block max-h-60 min-h-16 w-full resize-none bg-transparent px-4 pt-3 pb-12 text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Comment"
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-2">
          {body.length > 1800 ? <span className="text-xs text-muted-foreground tabular-nums">{2000 - body.length}</span> : null}
          <Button type="submit" size="icon" className="rounded-full" disabled={!body.trim() || sending} aria-label="Post comment">
            {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </form>
  );
}

type CommentRow = FunctionReturnType<typeof api.social.comments>['page'][number];

function Comment({ comment }: { comment: CommentRow }) {
  const { isSignedIn } = useAuth();
  const remove = useMutation(api.social.deleteComment);
  const [reporting, setReporting] = useState(false);

  return (
    <li className="group flex gap-3">
      <ChannelAvatar name={comment.author.name} imageUrl={comment.author.imageUrl} />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{comment.author.name}</span>
          {comment.isAuthorChannelOwner ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Creator</span>
          ) : null}
          <span className="text-xs text-muted-foreground">{timeAgo(comment._creationTime)}</span>
        </div>
        <div className="flex items-start gap-1">
          <p className="rounded-2xl rounded-tl-md bg-muted/70 px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
            <LinkifiedText text={comment.body} />
          </p>
          {isSignedIn ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                    aria-label="Comment actions"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                {comment.canDelete ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => remove({ commentId: comment._id }).catch((error) => toast.error(errorMessage(error)))}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => setReporting(true)}>
                  <Flag /> Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      <ReportDialog target={{ type: 'comment', id: comment._id }} open={reporting} onOpenChange={setReporting} />
    </li>
  );
}
