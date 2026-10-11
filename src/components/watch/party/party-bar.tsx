'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, LogOut, Mic, MicOff, Phone, PhoneOff, Users, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { ChannelAvatar } from '@/components/channel/channel-avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PartyController } from './party-controller';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Who's here, what the call is doing, and the buttons for it. Sits under the player. */
export function PartyBar({ party, inviteUrl, onLeave }: { party: PartyController; inviteUrl: string; onLeave: () => void }) {
  const call = party.call;
  const state = call?.state;
  const now = useNow(state?.kind === 'in-call');
  const [copied, setCopied] = useState(false);
  const other = party.party?.members.find((m) => m.peerId !== party.peerId);
  const name = other?.name.split(' ')[0] ?? 'your friend';

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success('Invite link copied — send it to a friend');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy. Select the link and copy it yourself.');
    }
  }

  let title: string;
  let detail: string | null = null;
  if (party.status === 'starting' || !call || !state) title = 'Joining the watch party…';
  else if (party.status === 'full') title = 'This watch party is full';
  else if (party.status === 'gone') title = 'This watch party has ended';
  else if (party.status === 'error') title = party.error ?? 'Something went wrong';
  else {
    switch (state.kind) {
      case 'connecting':
      case 'joining':
        title = 'Connecting…';
        break;
      case 'waiting':
        title = 'Waiting for a friend';
        detail = 'Send them the invite link. You’ll watch in sync and see each other on the screen.';
        break;
      case 'ready':
        title = `${other?.name ?? 'Your friend'} is here`;
        detail = 'Call them to talk and see each other.';
        break;
      case 'calling':
        title = `Calling ${name}…`;
        break;
      case 'ringing':
        title = `${other?.name ?? 'Your friend'} is calling`;
        break;
      case 'in-call':
        title = `In a call with ${name}`;
        detail = clock(now - state.since);
        break;
      case 'ended':
        title = state.reason;
        break;
      case 'full':
        title = 'This watch party is full';
        break;
    }
  }

  const live = party.status === 'active' && call;
  const showInvite = live && (state?.kind === 'waiting' || state?.kind === 'connecting');
  const hasMic = !!party.local?.getAudioTracks().length;
  const hasCamera = !!party.local?.getVideoTracks().length;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:p-4" aria-label="Watch party">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {(party.party?.members ?? []).map((m) => (
              <ChannelAvatar key={m.peerId} name={m.name} imageUrl={m.imageUrl} className="size-9 ring-2 ring-card" />
            ))}
            {!other ? (
              <span className="grid size-9 place-items-center rounded-full border border-dashed bg-muted/50 ring-2 ring-card">
                <Users className="size-4 text-muted-foreground" />
              </span>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              {party.status === 'starting' || state?.kind === 'connecting' || state?.kind === 'joining' ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : state?.kind === 'in-call' ? (
                <span className="size-2 rounded-full bg-emerald-400" />
              ) : null}
              {title}
              {state?.kind === 'in-call' && detail ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{detail}</span>
              ) : null}
            </p>
            {detail && state?.kind !== 'in-call' ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {live && hasMic ? (
            <RoundButton
              label={call.localMedia.audio ? 'Mute' : 'Unmute'}
              active={!call.localMedia.audio}
              onClick={() => call.setLocalMedia({ audio: !call.localMedia.audio })}
            >
              {call.localMedia.audio ? <Mic /> : <MicOff />}
            </RoundButton>
          ) : null}
          {live && hasCamera ? (
            <RoundButton
              label={call.localMedia.video ? 'Turn camera off' : 'Turn camera on'}
              active={!call.localMedia.video}
              onClick={() => call.setLocalMedia({ video: !call.localMedia.video })}
            >
              {call.localMedia.video ? <Video /> : <VideoOff />}
            </RoundButton>
          ) : null}

          {live && call.canCall ? (
            <Button className="h-10 rounded-full bg-emerald-500 px-4 text-white hover:bg-emerald-600" onClick={() => call.call()}>
              <Phone /> {state?.kind === 'ended' ? 'Call again' : 'Call'}
            </Button>
          ) : null}
          {live && state?.kind === 'ringing' ? (
            <>
              <RoundButton label="Decline" tone="end" onClick={() => call.decline()}>
                <PhoneOff />
              </RoundButton>
              <Button className="h-10 animate-pulse rounded-full bg-emerald-500 px-4 text-white hover:bg-emerald-600" onClick={() => call.answer()}>
                <Phone /> Answer
              </Button>
            </>
          ) : null}
          {live && (state?.kind === 'calling' || state?.kind === 'joining' || state?.kind === 'in-call') ? (
            <RoundButton label={state.kind === 'calling' ? 'Cancel call' : 'Hang up'} tone="end" onClick={() => call.hangUp()}>
              <PhoneOff />
            </RoundButton>
          ) : null}

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Leave the watch party" onClick={onLeave} />}
            >
              <LogOut />
            </TooltipTrigger>
            <TooltipContent>Leave the watch party</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {showInvite ? (
        <div className="flex items-center gap-2 rounded-xl border bg-background/60 p-1.5 pl-3">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{inviteUrl}</span>
          <Button size="sm" className="h-8 rounded-lg px-3" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy invite link'}
          </Button>
        </div>
      ) : null}
      {party.mediaProblem ? <p className="text-xs text-amber-300/90">{party.mediaProblem}</p> : null}
    </section>
  );
}

function RoundButton({
  label,
  onClick,
  active,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: 'end';
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              'grid size-10 place-items-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70 [&_svg]:size-[18px]',
              active && 'bg-foreground text-background hover:bg-foreground/90',
              tone === 'end' && 'bg-red-500 text-white hover:bg-red-600',
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
