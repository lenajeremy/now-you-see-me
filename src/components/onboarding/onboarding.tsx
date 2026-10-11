'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { SignUpButton, useAuth } from '@clerk/nextjs';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Columns2,
  Eye,
  Hand,
  Heart,
  Link2,
  MessageSquare,
  Monitor,
  UploadCloud,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@convex/_generated/api';
import { BrandMark } from '@/components/brand';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PanoThumb } from '@/components/video/pano-thumb';
import { cn } from '@/lib/utils';

/** Bump to show the tour again to everyone after it changes a lot. */
const SEEN_KEY = 'nysm.tour.v1';

const OnboardingContext = createContext<{ openTour: () => void }>({ openTour: () => {} });

/** Opens the "how it works" tour from anywhere (the sidebar, say). */
export function useOnboarding() {
  return useContext(OnboardingContext);
}

/**
 * The first-visit tour: what this is, how to look around and switch views,
 * watching together, and what you can do here. Shown once per browser, and
 * any time from "How it works".
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // Focus starts on the main button, not on Skip.
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === 'done';
    } catch {
      // Storage blocked: don't nag on every page.
    }
    const { pathname, search } = window.location;
    // Not over sign-in, Studio, or someone arriving from a watch-party invite.
    if (seen || /^\/(sign-in|sign-up|studio)/.test(pathname) || new URLSearchParams(search).has('party')) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, 'done');
    } catch {
      // Fine: it may show again next time.
    }
  }, []);

  const value = useMemo(
    () => ({
      openTour: () => {
        setStep(0);
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false} initialFocus={primary}>
          {open ? <Tour step={step} setStep={setStep} onDone={close} primary={primary} /> : null}
        </DialogContent>
      </Dialog>
    </OnboardingContext.Provider>
  );
}

interface Step {
  title: string;
  text: string;
  visual: () => ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Video you can stand inside',
    text: 'Every video here is 360°. Instead of watching a frame, you’re standing in the middle of the scene — and you choose where to look.',
    visual: () => <WelcomeVisual />,
  },
  {
    title: 'Look all the way round',
    text: 'Drag the video — or swipe on your phone — to turn your head. If you lose your way, the compass in the controls turns you back to the front.',
    visual: () => <DragVisual />,
  },
  {
    title: 'Step outside yourself',
    text: 'Switch views at the bottom right of the player: first person, an outside view of you standing in the scene, or both side by side. Keys 1, 2 and 3 do it too.',
    visual: () => <ViewsVisual />,
  },
  {
    title: 'Watch together',
    text: 'Press Watch together on any video and send a friend the link. You’ll be at the same moment, in sync, and see each other on a screen inside the video.',
    visual: () => <TogetherVisual />,
  },
  {
    title: 'Make it yours',
    text: 'Subscribe to channels you like, leave likes and comments, or upload your own 360° video from Studio. Uploads stay private until you publish them.',
    visual: () => <ActionsVisual />,
  },
];

function Tour({
  step,
  setStep,
  onDone,
  primary,
}: {
  step: number;
  setStep: (step: number) => void;
  onDone: () => void;
  primary: React.RefObject<HTMLButtonElement | null>;
}) {
  const { isSignedIn } = useAuth();
  const last = step === STEPS.length - 1;
  const current = STEPS[step]!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !last) setStep(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1);
    };
    // Capture: the dialog handles keys itself before they'd bubble up here.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, last, setStep]);

  return (
    <>
      <div className="relative aspect-video overflow-hidden bg-black">
        {current.visual()}
        <button
          type="button"
          onClick={onDone}
          className="absolute top-3 right-3 z-10 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur hover:bg-black/70 hover:text-white"
        >
          Skip
        </button>
      </div>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            {step === 0 ? 'Welcome to Now You See Me' : `How it works · ${step} of ${STEPS.length - 1}`}
          </p>
          <DialogTitle className="text-xl font-semibold tracking-tight">{current.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-pretty text-muted-foreground">{current.text}</DialogDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour steps">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}: ${s.title}`}
                onClick={() => setStep(i)}
                className={cn('h-1.5 rounded-full bg-muted-foreground/30 transition-all', i === step ? 'w-6 bg-primary' : 'w-1.5 hover:bg-muted-foreground/60')}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 ? (
              <Button variant="ghost" size="lg" className="rounded-full" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Back
              </Button>
            ) : null}
            {!last ? (
              <Button ref={primary} size="lg" className="rounded-full px-5" onClick={() => setStep(step + 1)}>
                {step === 0 ? 'Show me how' : 'Next'} <ArrowRight />
              </Button>
            ) : isSignedIn ? (
              <>
                <Link href="/studio/upload" onClick={onDone} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-full')}>
                  Upload a video
                </Link>
                <Button ref={primary} size="lg" className="rounded-full px-5" onClick={onDone}>
                  Start watching
                </Button>
              </>
            ) : (
              <>
                <SignUpButton mode="modal">
                  <Button variant="outline" size="lg" className="rounded-full" onClick={onDone}>
                    Create an account
                  </Button>
                </SignUpButton>
                <Button ref={primary} size="lg" className="rounded-full px-5" onClick={onDone}>
                  Start watching
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// --- Pictures for each step ----------------------------------------------------------

function WelcomeVisual() {
  const feed = useQuery(api.videos.feed, { paginationOpts: { numItems: 1, cursor: null } });
  const video = feed?.page[0];
  return (
    <>
      <PanoThumb
        playbackId={video?.playbackId}
        time={video?.thumbnailTime}
        facing={video?.facing}
        width={1600}
        autoPan
        period={45}
        className="absolute inset-0 aspect-auto"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-4 left-5 flex items-center gap-2 text-white">
        <BrandMark className="size-8" />
        <span className="font-semibold tracking-tight">Now You See Me</span>
        <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur">360°</span>
      </div>
    </>
  );
}

function DragVisual() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed picture of the player */}
      <img src="/onboarding/first.webp" alt="" className="absolute inset-0 size-full scale-110 animate-[tour-look_6s_ease-in-out_infinite] object-cover" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Hand className="size-10 animate-[tour-drag_3s_ease-in-out_infinite] fill-white/90 text-black/60 drop-shadow-lg" />
          <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">Drag to look around</span>
        </div>
      </div>
    </>
  );
}

function ViewsVisual() {
  const modes: [LucideIcon, string][] = [
    [Eye, 'First person'],
    [Columns2, 'Both'],
    [Video, 'Outside'],
  ];
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed picture of the player */}
      <img src="/onboarding/split.webp" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute right-3 bottom-3 flex rounded-full bg-black/60 p-1 backdrop-blur">
        {modes.map(([Icon, label], i) => (
          <span
            key={label}
            className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-white/80', i === 1 && 'bg-white text-neutral-900')}
          >
            <Icon className="size-3.5" /> {label}
          </span>
        ))}
      </div>
    </>
  );
}

function TogetherVisual() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_25%,transparent),transparent_60%),#0b0d12]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed picture of the player */}
      <img src="/onboarding/first.webp" alt="" className="absolute inset-0 size-full object-cover opacity-35" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
        <div className="relative grid aspect-video w-52 place-items-center rounded-lg border-4 border-neutral-800 bg-neutral-900 shadow-2xl">
          <div className="flex flex-col items-center gap-2 text-white">
            <span className="grid size-12 place-items-center rounded-full bg-emerald-500/20 text-lg font-semibold text-emerald-200 ring-2 ring-emerald-400/40">
              A
            </span>
            <span className="text-xs text-white/70">Alex · in the call</span>
          </div>
          <Monitor className="absolute -bottom-7 size-5 text-white/40" />
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-full bg-black/60 py-1.5 pr-3 pl-1.5 text-xs text-white backdrop-blur">
          <span className="flex -space-x-2">
            <span className="grid size-6 place-items-center rounded-full bg-sky-500/80 text-[10px] font-semibold ring-2 ring-black">Y</span>
            <span className="grid size-6 place-items-center rounded-full bg-emerald-500/80 text-[10px] font-semibold ring-2 ring-black">A</span>
          </span>
          <Link2 className="size-3.5 text-white/60" />
          <span className="font-mono text-white/80">…/watch/…?party=…</span>
        </div>
      </div>
    </div>
  );
}

function ActionsVisual() {
  const actions: [LucideIcon, string, string][] = [
    [Bell, 'Subscribe', 'New videos from channels you follow'],
    [Heart, 'Like', 'Show creators some love'],
    [MessageSquare, 'Comment', 'Say what you spotted'],
    [UploadCloud, 'Upload', 'Share your own 360° video'],
  ];
  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-3 bg-[radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_60%),#0b0d12] p-5">
      {actions.map(([Icon, title, text]) => (
        <div key={title} className="flex flex-col justify-end gap-1 rounded-xl border border-white/10 bg-white/5 p-3 text-white">
          <Icon className="mb-auto size-5 text-primary" />
          <span className="text-sm font-medium">{title}</span>
          <span className="text-[11px] leading-snug text-white/60">{text}</span>
        </div>
      ))}
    </div>
  );
}
