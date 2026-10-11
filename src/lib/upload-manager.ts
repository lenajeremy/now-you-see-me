'use client';

/**
 * Uploads in flight, kept outside React so they carry on while you move
 * around the app (Studio shows their progress), and warn before the tab closes.
 */

import { useSyncExternalStore } from 'react';
import type { UpChunk } from '@mux/upchunk';

export interface UploadProgress {
  videoId: string;
  fileName: string;
  bytes: number;
  /** 0–100. */
  percent: number;
  /** Recent speed, for "time left". */
  bytesPerSecond: number;
  status: 'uploading' | 'paused' | 'offline' | 'done' | 'failed' | 'cancelled';
  error?: string;
}

const uploads = new Map<string, UploadProgress>();
const chunkers = new Map<string, UpChunk>();
const listeners = new Set<() => void>();
let snapshot: UploadProgress[] = [];

function set(videoId: string, patch: Partial<UploadProgress>) {
  const current = uploads.get(videoId);
  if (!current) return;
  uploads.set(videoId, { ...current, ...patch });
  snapshot = [...uploads.values()];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (snapshot.some((u) => u.status === 'uploading' || u.status === 'paused' || u.status === 'offline')) {
    event.preventDefault();
  }
}

/**
 * Sends a file to Mux in chunks (resuming after dropped connections) and
 * calls `onFinished` once Mux has all of it.
 */
export async function startFileUpload(videoId: string, endpoint: string, file: File, onFinished: () => Promise<unknown>) {
  const { createUpload } = await import('@mux/upchunk');
  uploads.set(videoId, { videoId, fileName: file.name, bytes: file.size, percent: 0, bytesPerSecond: 0, status: 'uploading' });
  snapshot = [...uploads.values()];
  listeners.forEach((listener) => listener());
  if (typeof window !== 'undefined' && chunkers.size === 0) window.addEventListener('beforeunload', warnBeforeLeaving);

  // 32 MB chunks: big 360° files go faster in fewer, larger requests.
  const upload = createUpload({ endpoint, file, chunkSize: 32 * 1024, dynamicChunkSize: true });
  chunkers.set(videoId, upload);

  let sample = { at: performance.now(), percent: 0 };
  upload.on('progress', (event) => {
    const percent = event.detail as number;
    const now = performance.now();
    const seconds = (now - sample.at) / 1000;
    const patch: Partial<UploadProgress> = { percent, status: 'uploading' };
    if (seconds > 2) {
      const speed = (((percent - sample.percent) / 100) * file.size) / seconds;
      const previous = uploads.get(videoId)?.bytesPerSecond ?? 0;
      patch.bytesPerSecond = previous ? previous * 0.6 + speed * 0.4 : speed;
      sample = { at: now, percent };
    }
    set(videoId, patch);
  });
  upload.on('offline', () => set(videoId, { status: 'offline' }));
  upload.on('online', () => set(videoId, { status: 'uploading' }));
  upload.on('error', (event) => {
    set(videoId, { status: 'failed', error: (event.detail as { message?: string })?.message ?? 'The upload failed.' });
    finish(videoId);
  });
  upload.on('success', () => {
    set(videoId, { status: 'done', percent: 100 });
    finish(videoId);
    void onFinished();
  });
}

function finish(videoId: string) {
  chunkers.delete(videoId);
  if (chunkers.size === 0 && typeof window !== 'undefined') window.removeEventListener('beforeunload', warnBeforeLeaving);
}

export function cancelFileUpload(videoId: string) {
  chunkers.get(videoId)?.abort();
  set(videoId, { status: 'cancelled' });
  finish(videoId);
}

export function pauseFileUpload(videoId: string, paused: boolean) {
  const upload = chunkers.get(videoId);
  if (!upload) return;
  if (paused) upload.pause();
  else upload.resume();
  set(videoId, { status: paused ? 'paused' : 'uploading' });
}

/** Every upload this tab has started. */
export function useUploads(): UploadProgress[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

const EMPTY: UploadProgress[] = [];

export function useUpload(videoId: string | null | undefined): UploadProgress | undefined {
  const all = useUploads();
  return videoId ? all.find((u) => u.videoId === videoId) : undefined;
}

/** "3 min left" from progress so far. */
export function timeLeft(upload: UploadProgress): string | null {
  if (!upload.bytesPerSecond || upload.status !== 'uploading') return null;
  const seconds = ((100 - upload.percent) / 100) * upload.bytes / upload.bytesPerSecond;
  if (seconds < 60) return 'less than a minute left';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`;
  return `${(seconds / 3600).toFixed(1)} h left`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
