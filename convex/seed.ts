import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { importFromUrl, openUpload } from './mux';

/*
 * Seeds curated channels with openly licensed 360° video, so the site has
 * plenty to watch. Each video credits the people who made it.
 *
 *   Files on this computer:  node scripts/seed-originals.mjs [--prod]
 *   From Wikimedia Commons:  node scripts/import-commons.mjs [--prod]
 */

const channelArgs = v.object({
  handle: v.string(),
  name: v.string(),
  description: v.string(),
  /** Served by the app from public/. */
  avatarUrl: v.string(),
});

const ORIGINALS = {
  handle: 'originals',
  name: 'Now You See Me Originals',
  description:
    'Openly licensed 360° video from around the world, to get you started. Each video credits the people who filmed it.',
  avatarUrl: '/originals.svg',
};

/** A channel run by the site itself, owned by a system user of its own. */
export const ensureChannel = internalMutation({
  args: { channel: channelArgs },
  handler: async (ctx, { channel }): Promise<Id<'channels'>> => {
    const clerkId = `system:${channel.handle}`;
    let user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', clerkId))
      .unique();
    if (!user) {
      const id = await ctx.db.insert('users', { clerkId, name: channel.name, imageUrl: channel.avatarUrl });
      user = (await ctx.db.get(id))!;
    }
    const existing = await ctx.db
      .query('channels')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name: channel.name, description: channel.description, avatarUrl: channel.avatarUrl });
      return existing._id;
    }
    return ctx.db.insert('channels', { ownerId: user._id, ...channel, subscriberCount: 0, videoCount: 0 });
  },
});

export const insertDraft = internalMutation({
  args: { channelId: v.id('channels'), title: v.string(), description: v.string(), facing: v.number() },
  handler: (ctx, { channelId, title, description, facing }) =>
    ctx.db.insert('videos', {
      channelId,
      title,
      description,
      facing,
      visibility: 'public',
      status: 'uploading',
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    }),
});

/** Whether a channel already has a video with this title (so imports can be re-run safely). */
export const hasVideo = internalMutation({
  args: { handle: v.string(), title: v.string() },
  handler: async (ctx, { handle, title }) => {
    const channel = await ctx.db
      .query('channels')
      .withIndex('by_handle', (q) => q.eq('handle', handle))
      .unique();
    if (!channel) return false;
    const videos = await ctx.db
      .query('videos')
      .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
      .collect();
    return videos.some((video) => video.title === title && video.status !== 'errored');
  },
});

/** Opens an upload address for a video on the Originals channel; the file is then PUT to it. */
export const originalsUpload = internalAction({
  args: { title: v.string(), description: v.string(), facing: v.number() },
  handler: async (ctx, args): Promise<{ videoId: Id<'videos'>; uploadUrl: string }> => {
    const channelId: Id<'channels'> = await ctx.runMutation(internal.seed.ensureChannel, { channel: ORIGINALS });
    const videoId: Id<'videos'> = await ctx.runMutation(internal.seed.insertDraft, { channelId, ...args });
    // Uploaded from a terminal, not a browser, so any origin.
    return { videoId, uploadUrl: await openUpload(ctx, videoId, '*') };
  },
});

/** Adds a video that Mux fetches from a public address. Skips it if the channel already has it. */
export const importVideo = internalAction({
  args: { channel: channelArgs, title: v.string(), description: v.string(), facing: v.number(), url: v.string() },
  handler: async (ctx, { channel, url, ...video }): Promise<{ videoId: Id<'videos'> | null; skipped: boolean }> => {
    const channelId: Id<'channels'> = await ctx.runMutation(internal.seed.ensureChannel, { channel });
    if (await ctx.runMutation(internal.seed.hasVideo, { handle: channel.handle, title: video.title })) {
      return { videoId: null, skipped: true };
    }
    const videoId: Id<'videos'> = await ctx.runMutation(internal.seed.insertDraft, { channelId, ...video });
    await importFromUrl(ctx, videoId, url);
    return { videoId, skipped: false };
  },
});

/** Opens an upload address for a video on a curated channel; the file is then PUT to it. */
export const importUpload = internalAction({
  args: { channel: channelArgs, title: v.string(), description: v.string(), facing: v.number() },
  handler: async (ctx, { channel, ...video }): Promise<{ videoId: Id<'videos'>; uploadUrl: string }> => {
    const channelId: Id<'channels'> = await ctx.runMutation(internal.seed.ensureChannel, { channel });
    const videoId: Id<'videos'> = await ctx.runMutation(internal.seed.insertDraft, { channelId, ...video });
    try {
      return { videoId, uploadUrl: await openUpload(ctx, videoId, '*') };
    } catch (error) {
      await ctx.runMutation(internal.videos.discardDraft, { videoId });
      throw error;
    }
  },
});

/** Clears out a curated channel's failed imports, so they can be tried again cleanly. */
export const removeFailed = internalMutation({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const channel = await ctx.db
      .query('channels')
      .withIndex('by_handle', (q) => q.eq('handle', handle))
      .unique();
    if (!channel) return 0;
    const videos = await ctx.db
      .query('videos')
      .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
      .collect();
    let removed = 0;
    for (const video of videos) {
      const stuck = video.status === 'uploading' && !video.muxUploadId;
      if (video.status !== 'errored' && video.status !== 'rejected' && !stuck) continue;
      if (video.muxAssetId) await ctx.scheduler.runAfter(0, internal.mux.deleteAsset, { assetId: video.muxAssetId });
      await ctx.db.delete(video._id);
      removed++;
    }
    return removed;
  },
});

/** Undoes an import whose file never reached Mux, so the next run tries it again. */
export const discardImport = internalMutation({
  args: { videoId: v.id('videos') },
  handler: async (ctx, { videoId }) => {
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== 'uploading') return false;
    if (video.muxUploadId) await ctx.scheduler.runAfter(0, internal.mux.discardUpload, { uploadId: video.muxUploadId });
    await ctx.db.delete(videoId);
    return true;
  },
});
