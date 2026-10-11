import { ConvexError, v } from 'convex/values';
import { action, internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { visibility } from './schema';

const MUX_API = 'https://api.mux.com/video/v1';
/** How far a video's width may be from twice its height and still count as 360°. */
const ASPECT_TOLERANCE = 0.04;
/** Give up waiting for Mux to process a video after this long. */
const MAX_WAIT_MS = 3 * 60 * 60 * 1000;
/** Mux closes an upload address after this long; uploads must finish within it. */
const UPLOAD_TIMEOUT_S = 24 * 60 * 60;

async function mux<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error('Mux is not configured: set MUX_TOKEN_ID and MUX_TOKEN_SECRET in Convex.');
  const response = await fetch(`${MUX_API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`Mux ${init?.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as { data: T }).data;
}

interface MuxUpload {
  id: string;
  url: string;
  status: 'waiting' | 'asset_created' | 'errored' | 'cancelled' | 'timed_out';
  asset_id?: string;
}

interface MuxAsset {
  status: 'preparing' | 'ready' | 'errored';
  duration?: number;
  playback_ids?: { id: string; policy: string }[];
  tracks?: { type: string; max_width?: number; max_height?: number }[];
  errors?: { messages?: string[] };
}

/**
 * Opens a Mux upload address for a video and starts watching it. Mux keeps up to 4K.
 * Shared by startUpload and the seed script.
 */
export async function openUpload(ctx: ActionCtx, videoId: Id<'videos'>, origin: string): Promise<string> {
  const upload = await mux<MuxUpload>('/uploads', {
    method: 'POST',
    body: {
      cors_origin: origin,
      timeout: UPLOAD_TIMEOUT_S, // big 360° files on slow connections take a while
      new_asset_settings: {
        playback_policies: ['public'],
        video_quality: 'plus',
        max_resolution_tier: '2160p',
        passthrough: videoId,
      },
    },
  });
  await ctx.runMutation(internal.videos.setUpload, { videoId, uploadId: upload.id });
  // The browser says when it has finished sending; this catches uploads whose tab closed first.
  await ctx.scheduler.runAfter(60_000, internal.mux.watchUpload, { videoId, startedAt: Date.now() });
  return upload.url;
}

/**
 * Has Mux fetch a video from a public address (used to import openly licensed
 * videos) and starts waiting for it to be processed.
 */
export async function importFromUrl(ctx: ActionCtx, videoId: Id<'videos'>, url: string): Promise<string> {
  const asset = await mux<{ id: string }>('/assets', {
    method: 'POST',
    body: {
      inputs: [{ url }],
      playback_policies: ['public'],
      video_quality: 'plus',
      max_resolution_tier: '2160p',
      passthrough: videoId,
    },
  });
  await ctx.runMutation(internal.videos.beginProcessing, { videoId, assetId: asset.id });
  return asset.id;
}

/**
 * Starts an upload: creates the video (as "uploading") and a Mux upload address
 * the browser sends the file to directly.
 */
export const startUpload = action({
  args: { title: v.string(), visibility, origin: v.string() },
  handler: async (ctx, { title, visibility, origin }): Promise<{ videoId: string; uploadUrl: string }> => {
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new ConvexError('Bad origin.');
    const videoId = await ctx.runMutation(internal.videos.createDraft, { title, visibility });
    try {
      return { videoId, uploadUrl: await openUpload(ctx, videoId, origin) };
    } catch (error) {
      // Don't leave a video stuck "waiting for upload" in Studio.
      await ctx.runMutation(internal.videos.discardDraft, { videoId });
      if (String(error).includes('limited to')) {
        throw new ConvexError('Uploads are paused: the site has reached its video storage limit. Please try again later.');
      }
      throw error;
    }
  },
});

/**
 * Checks on an upload once a minute until Mux has the whole file, then hands
 * over to waitForAsset. Stops as soon as the video is no longer uploading.
 */
export const watchUpload = internalAction({
  args: { videoId: v.id('videos'), startedAt: v.number() },
  handler: async (ctx, { videoId, startedAt }): Promise<void> => {
    const video: Doc<'videos'> | null = await ctx.runQuery(internal.videos.getInternal, { videoId });
    if (!video?.muxUploadId || video.status !== 'uploading') return;
    const upload: MuxUpload = await mux<MuxUpload>(`/uploads/${video.muxUploadId}`);
    if (upload.status === 'errored' || upload.status === 'cancelled' || upload.status === 'timed_out') {
      await ctx.runMutation(internal.videos.markFailed, {
        videoId,
        status: 'errored',
        message: `The upload ${upload.status.replace('_', ' ')}. Try uploading again.`,
      });
      return;
    }
    if (upload.asset_id) {
      await ctx.runMutation(internal.videos.beginProcessing, { videoId, assetId: upload.asset_id });
      return;
    }
    if (Date.now() - startedAt > (UPLOAD_TIMEOUT_S + 3600) * 1000) {
      await ctx.runMutation(internal.videos.markFailed, {
        videoId,
        status: 'errored',
        message: 'The upload never finished. Try uploading again.',
      });
      return;
    }
    await ctx.scheduler.runAfter(60_000, internal.mux.watchUpload, { videoId, startedAt });
  },
});

/**
 * Follows a finished upload until Mux has processed it, then marks the video
 * ready — or rejected, if it isn't 360° (twice as wide as it is tall).
 */
export const waitForAsset = internalAction({
  args: { videoId: v.id('videos'), attempt: v.number(), startedAt: v.optional(v.number()) },
  // Annotated: this action schedules itself, which defeats type inference.
  handler: async (ctx, { videoId, attempt, startedAt = Date.now() }): Promise<void> => {
    const video: Doc<'videos'> | null = await ctx.runQuery(internal.videos.getInternal, { videoId });
    if (!video || video.status !== 'processing') return;
    const fail = (status: 'errored' | 'rejected', message: string): Promise<null> =>
      ctx.runMutation(internal.videos.markFailed, { videoId, status, message });

    let assetId = video.muxAssetId;
    if (!assetId && video.muxUploadId) {
      const upload: MuxUpload = await mux<MuxUpload>(`/uploads/${video.muxUploadId}`);
      if (upload.status === 'errored' || upload.status === 'cancelled' || upload.status === 'timed_out') {
        await fail('errored', `The upload ${upload.status.replace('_', ' ')}. Try uploading again.`);
        return;
      }
      if (upload.asset_id) {
        assetId = upload.asset_id;
        await ctx.runMutation(internal.videos.setAsset, { videoId, assetId });
      }
    }

    if (assetId) {
      const asset: MuxAsset = await mux<MuxAsset>(`/assets/${assetId}`);
      if (asset.status === 'errored') {
        await fail('errored', asset.errors?.messages?.join(' ') || "Mux couldn't process this video.");
        return;
      }
      if (asset.status === 'ready') {
        const track = asset.tracks?.find((t) => t.type === 'video');
        const width = track?.max_width ?? 0;
        const height = track?.max_height ?? 0;
        const playbackId = asset.playback_ids?.find((p) => p.policy === 'public')?.id;
        if (!width || !height || Math.abs(width / height - 2) > ASPECT_TOLERANCE) {
          await mux(`/assets/${assetId}`, { method: 'DELETE' });
          await fail(
            'rejected',
            `This isn't a 360° video: it's ${width}×${height}. 360° videos are twice as wide as they are tall (for example 3840×1920).`,
          );
          return;
        }
        if (!playbackId) {
          await fail('errored', 'Mux processed the video but gave it no playback address.');
          return;
        }
        await ctx.runMutation(internal.videos.markReady, {
          videoId,
          playbackId,
          duration: asset.duration ?? 0,
          width,
          height,
        });
        return;
      }
    }

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      await fail('errored', 'Processing took too long. Try uploading again.');
      return;
    }
    // Check often at first, then back off for long videos.
    const delay = attempt < 60 ? 5_000 : 30_000;
    await ctx.scheduler.runAfter(delay, internal.mux.waitForAsset, { videoId, attempt: attempt + 1, startedAt });
  },
});

export const deleteAsset = internalAction({
  args: { assetId: v.string() },
  handler: async (_ctx, { assetId }) => {
    await mux(`/assets/${assetId}`, { method: 'DELETE' }).catch((error) => console.warn(String(error)));
  },
});

/** Cleans up after a video deleted before we knew its asset: cancels the upload, or deletes what it made. */
export const discardUpload = internalAction({
  args: { uploadId: v.string() },
  handler: async (_ctx, { uploadId }) => {
    try {
      const upload = await mux<MuxUpload>(`/uploads/${uploadId}`);
      if (upload.asset_id) await mux(`/assets/${upload.asset_id}`, { method: 'DELETE' });
      else if (upload.status === 'waiting') await mux(`/uploads/${uploadId}/cancel`, { method: 'PUT' });
    } catch (error) {
      console.warn(String(error));
    }
  },
});
