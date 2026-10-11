'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction, useMutation } from 'convex/react';
import { AlertTriangle, Check, CheckCircle2, FileVideo, Loader2, Orbit, Pause, Play, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { CreateChannel } from '@/components/channel/create-channel';
import { WorldPlayer } from '@/components/player/world-player';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useMe } from '@/hooks/use-me';
import { errorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  cancelFileUpload,
  formatBytes,
  pauseFileUpload,
  startFileUpload,
  timeLeft,
  useUpload,
} from '@/lib/upload-manager';
import { VisibilityPicker } from './visibility-picker';
import type { Visibility } from './visibility';

/** How far from 2:1 a video may be and still count as 360° (matches the server). */
const ASPECT_TOLERANCE = 0.04;
const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv';

interface Probe {
  /** Readable by this browser; when false, we couldn't check the shape. */
  readable: boolean;
  width: number;
  height: number;
  duration: number;
}

/** Reads a file's frame size and length without uploading it. */
function probe(url: string): Promise<Probe> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const done = (result: Probe) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    const timer = setTimeout(() => done({ readable: false, width: 0, height: 0, duration: 0 }), 8000);
    video.onloadedmetadata = () =>
      done({
        readable: video.videoWidth > 0,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    video.onerror = () => done({ readable: false, width: 0, height: 0, duration: 0 });
    video.src = url;
  });
}

function titleFromFile(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

type Step =
  | { kind: 'pick' }
  | { kind: 'checking'; file: File }
  | { kind: 'not-360'; file: File; probe: Probe }
  | { kind: 'details'; file: File; url: string; probe: Probe; videoId: Id<'videos'> | null };

const STEPS = ['Choose a file', 'Add details', 'Processing'];

/** Upload a 360° video: pick it, check it, then fill in details while it uploads. */
export function UploadFlow() {
  const me = useMe();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const startUpload = useAction(api.mux.startUpload);
  const uploadFinished = useMutation(api.videos.uploadFinished);
  const objectUrl = useRef<string | null>(null);

  // Let go of the local file's address when we leave.
  useEffect(() => () => void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)), []);

  const choose = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
        toast.error('That isn’t a video file.');
        return;
      }
      setStep({ kind: 'checking', file });
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const url = URL.createObjectURL(file);
      objectUrl.current = url;
      const result = await probe(url);
      if (result.readable && Math.abs(result.width / result.height - 2) > ASPECT_TOLERANCE) {
        setStep({ kind: 'not-360', file, probe: result });
        return;
      }
      setStep({ kind: 'details', file, url, probe: result, videoId: null });
      try {
        const { videoId, uploadUrl } = await startUpload({
          title: titleFromFile(file.name) || 'Untitled 360° video',
          // A private draft until its details are saved.
          visibility: 'private',
          origin: window.location.origin,
        });
        const id = videoId as Id<'videos'>;
        setStep((current) => (current.kind === 'details' && current.file === file ? { ...current, videoId: id } : current));
        await startFileUpload(id, uploadUrl, file, () => uploadFinished({ id }));
      } catch (error) {
        toast.error(errorMessage(error, 'Couldn’t start the upload. Try again.'));
        setStep({ kind: 'pick' });
      }
    },
    [startUpload, uploadFinished],
  );

  if (me.status === 'loading') return <UploadSkeleton />;
  if (me.status === 'ready' && !me.channel) {
    return (
      <div className="py-6">
        <CreateChannel title="First, create your channel" subtitle="Your videos live on your channel. Pick a name and a handle, then upload." />
      </div>
    );
  }

  const index = step.kind === 'details' ? 1 : 0;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upload a 360° video</h1>
          <p className="mt-1 text-sm text-muted-foreground">It uploads while you add the details. You can leave this page — it carries on.</p>
        </div>
        <ol className="flex items-center gap-2 text-xs text-muted-foreground">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full border text-[11px] font-medium',
                  i < index && 'border-primary bg-primary text-primary-foreground',
                  i === index && 'border-primary text-primary',
                )}
              >
                {i < index ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn(i === index && 'text-foreground')}>{label}</span>
              {i < STEPS.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
            </li>
          ))}
        </ol>
      </header>

      {step.kind === 'pick' || step.kind === 'checking' ? (
        <DropZone checking={step.kind === 'checking' ? step.file : null} onFile={choose} />
      ) : null}
      {step.kind === 'not-360' ? <Not360 file={step.file} probe={step.probe} onRetry={() => setStep({ kind: 'pick' })} /> : null}
      {step.kind === 'details' ? <Details step={step} /> : null}
    </div>
  );
}

function DropZone({ checking, onFile }: { checking: File | null; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          'relative flex min-h-[360px] flex-col items-center justify-center gap-5 overflow-hidden rounded-3xl border-2 border-dashed bg-card/40 px-6 py-14 text-center transition-colors',
          over && 'border-primary bg-primary/5',
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,color-mix(in_oklch,var(--color-primary)_12%,transparent),transparent)]" />
        {checking ? (
          <>
            <Loader2 className="size-10 animate-spin text-primary" />
            <div>
              <p className="font-medium">Checking {checking.name}…</p>
              <p className="mt-1 text-sm text-muted-foreground">Making sure it’s a 360° video before it uploads.</p>
            </div>
          </>
        ) : (
          <>
            <div className="relative grid size-20 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <UploadCloud className="size-9 text-primary" />
            </div>
            <div className="relative">
              <p className="text-lg font-medium">Drag and drop a 360° video</p>
              <p className="mt-1 text-sm text-muted-foreground">Your video stays private until you publish it.</p>
            </div>
            <Button size="lg" className="relative h-10 rounded-full px-6" onClick={() => input.current?.click()}>
              Choose a file
            </Button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onFile(file);
              }}
            />
          </>
        )}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        {[
          ['360° only', 'Equirectangular video: twice as wide as it’s tall, like 3840×1920 or 7680×3840.'],
          ['Files', 'MP4, MOV, WebM or MKV, straight from your camera or editor.'],
          ['Quality', 'Kept and streamed at up to 4K. 8K is on the way.'],
        ].map(([title, text]) => (
          <div key={title} className="rounded-xl border bg-card/40 p-4">
            <dt className="font-medium">{title}</dt>
            <dd className="mt-1 text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The file's shape next to the 2:1 a 360° video has. */
function Not360({ file, probe, onRetry }: { file: File; probe: Probe; onRetry: () => void }) {
  const ratio = probe.width / probe.height;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 rounded-3xl border bg-card p-8 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-destructive/15">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">This isn’t a 360° video</h2>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          {file.name} is {probe.width}×{probe.height}. 360° videos are exactly twice as wide as they are tall — that’s how
          cameras like Insta360 and GoPro Max export them.
        </p>
      </div>
      <div className="flex items-end gap-6">
        <figure className="flex flex-col items-center gap-2">
          <div className="h-16 rounded-md border-2 border-destructive/60 bg-destructive/10" style={{ width: Math.min(160, 64 * ratio) }} />
          <figcaption className="text-xs text-muted-foreground">Yours ({ratio.toFixed(2)}:1)</figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-2">
          <div className="h-16 w-32 rounded-md border-2 border-emerald-500/60 bg-emerald-500/10" />
          <figcaption className="text-xs text-muted-foreground">360° (2:1)</figcaption>
        </figure>
      </div>
      <Button size="lg" className="rounded-full" onClick={onRetry}>
        Choose another file
      </Button>
    </div>
  );
}

function Details({ step }: { step: Extract<Step, { kind: 'details' }> }) {
  const router = useRouter();
  const update = useMutation(api.videos.update);
  const upload = useUpload(step.videoId);
  const [title, setTitle] = useState(() => titleFromFile(step.file.name));
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!step.videoId) return;
    setSaving(true);
    try {
      await update({ id: step.videoId, title, description, visibility });
      toast.success(
        visibility === 'public' ? 'Saved. It goes live as soon as it’s processed.' : 'Saved. It’ll be ready in Studio once it’s processed.',
      );
      router.push('/studio');
    } catch (error) {
      toast.error(errorMessage(error));
      setSaving(false);
    }
  }

  const failed = upload?.status === 'failed' || upload?.status === 'cancelled';
  return (
    <form onSubmit={save} className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="title">Title</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{title.length}/100</span>
          </div>
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 100))}
            placeholder="Where are we?"
            required
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="description">Description</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{description.length}/5000</span>
          </div>
          <Textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 5000))}
            placeholder="Tell viewers where this is, what to look for, and which way to turn."
            className="min-h-40"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Visibility</Label>
          <VisibilityPicker value={visibility} onChange={setVisibility} />
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="overflow-hidden rounded-2xl border bg-card">
          {step.probe.readable ? (
            <WorldPlayer src={step.url} facing={0.5} className="aspect-video" />
          ) : (
            <div className="grid aspect-video place-items-center bg-muted/40 p-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <Orbit className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Your browser can’t preview this file, but it will play here once it’s processed.</p>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-start gap-3">
              <FileVideo className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{step.file.name}</p>
                <p className="text-muted-foreground">
                  {[
                    formatBytes(step.file.size),
                    step.probe.readable ? `${step.probe.width}×${step.probe.height}` : null,
                    step.probe.duration ? formatDuration(step.probe.duration) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <UploadStatus videoId={step.videoId} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 flex-1 rounded-full')}>
            Save later
          </Link>
          <Button type="submit" size="lg" className="h-10 flex-1 rounded-full" disabled={!step.videoId || saving || failed || !title.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {visibility === 'public' ? 'Publish' : 'Save'}
          </Button>
        </div>
      </aside>
    </form>
  );
}

/** Progress, speed and time left, with pause and cancel. */
export function UploadStatus({ videoId }: { videoId: Id<'videos'> | null }) {
  const upload = useUpload(videoId);
  if (!videoId || !upload) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Preparing the upload…
      </div>
    );
  }
  if (upload.status === 'done') {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
        <p>
          <span className="font-medium">Uploaded.</span>{' '}
          <span className="text-muted-foreground">Processing takes a few minutes; we’ll check it’s 360° and get it ready in up to 4K.</span>
        </p>
      </div>
    );
  }
  if (upload.status === 'failed' || upload.status === 'cancelled') {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p>{upload.status === 'cancelled' ? 'Upload cancelled.' : `The upload failed: ${upload.error}`}</p>
      </div>
    );
  }
  const left = timeLeft(upload);
  const paused = upload.status === 'paused';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium tabular-nums">
          {upload.status === 'offline' ? 'Offline — waiting to resume' : paused ? 'Paused' : `Uploading ${Math.floor(upload.percent)}%`}
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={paused ? 'Resume upload' : 'Pause upload'}
            onClick={() => pauseFileUpload(videoId, !paused)}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel upload" onClick={() => cancelFileUpload(videoId)}>
            <X />
          </Button>
        </span>
      </div>
      <Progress value={upload.percent} />
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatBytes((upload.percent / 100) * upload.bytes)} of {formatBytes(upload.bytes)}
        {upload.bytesPerSecond ? ` · ${formatBytes(upload.bytesPerSecond)}/s` : ''}
        {left ? ` · ${left}` : ''}
      </p>
    </div>
  );
}

function UploadSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="h-[360px] rounded-3xl" />
    </div>
  );
}
