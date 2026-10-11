import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { currentUser, requireChannel } from './lib/auth';
import { visibility } from './schema';

/** A video with the channel it belongs to, as cards and pages show it. */
async function withChannel(ctx: QueryCtx, video: Doc<'videos'>) {
  const channel = await ctx.db.get(video.channelId);
  return {
    ...video,
    channel: channel && { _id: channel._id, handle: channel.handle, name: channel.name, avatarUrl: channel.avatarUrl },
  };
}

/** Whether a video is published: ready, public, and so in feeds and search. */
function publishedAt(video: Pick<Doc<'videos'>, 'status' | 'visibility' | 'publishedAt'>): number | undefined {
  if (video.status !== 'ready' || video.visibility !== 'public') return undefined;
  return video.publishedAt ?? Date.now();
}

async function requireOwnVideo(ctx: QueryCtx, id: Id<'videos'>) {
  const { channel } = await requireChannel(ctx);
  const video = await ctx.db.get(id);
  if (!video || video.channelId !== channel._id) throw new ConvexError("That video isn't yours.");
  return { channel, video };
}

// --- Feeds and pages ---------------------------------------------------------------

/** The home feed: newest published videos first. */
export const feed = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query('videos')
      .withIndex('by_published', (q) => q.gt('publishedAt', 0))
      .order('desc')
      .paginate(paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((video) => withChannel(ctx, video))) };
  },
});

/** Newest videos from the channels the signed-in person subscribes to. */
export const subscriptionsFeed = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(100);
    const perChannel = await Promise.all(
      subscriptions.map((s) =>
        ctx.db
          .query('videos')
          .withIndex('by_channel', (q) => q.eq('channelId', s.channelId))
          .order('desc')
          .take(20),
      ),
    );
    const videos = perChannel
      .flat()
      .filter((video) => video.publishedAt)
      .sort((a, b) => b.publishedAt! - a.publishedAt!)
      .slice(0, 60);
    return Promise.all(videos.map((video) => withChannel(ctx, video)));
  },
});

/** A channel's published videos, newest first. */
export const byChannel = query({
  args: { channelId: v.id('channels') },
  handler: async (ctx, { channelId }) => {
    const videos = await ctx.db
      .query('videos')
      .withIndex('by_channel', (q) => q.eq('channelId', channelId))
      .order('desc')
      .take(200);
    return Promise.all(videos.filter((video) => video.publishedAt).map((video) => withChannel(ctx, video)));
  },
});

/** The watch page: the video, its channel, and how the viewer relates to them. Null if it can't be watched. */
export const get = query({
  // Any string, so a mistyped address shows "unavailable" instead of an error.
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const videoId = ctx.db.normalizeId('videos', id);
    const video = videoId && (await ctx.db.get(videoId));
    if (!video) return null;
    const channel = await ctx.db.get(video.channelId);
    if (!channel) return null;
    const user = await currentUser(ctx);
    const isOwner = user?._id === channel.ownerId;
    // Private videos are only for their owner, as are ones still on their way;
    // unlisted ones are for anyone with the link.
    if (!isOwner && (video.visibility === 'private' || video.status !== 'ready')) return null;
    const [like, subscription] = user
      ? await Promise.all([
          ctx.db
            .query('likes')
            .withIndex('by_user_video', (q) => q.eq('userId', user._id).eq('videoId', video._id))
            .unique(),
          ctx.db
            .query('subscriptions')
            .withIndex('by_user_channel', (q) => q.eq('userId', user._id).eq('channelId', channel._id))
            .unique(),
        ])
      : [null, null];
    const { muxUploadId: _upload, muxAssetId: _asset, ...shown } = video;
    return {
      video: shown,
      channel: {
        _id: channel._id,
        handle: channel.handle,
        name: channel.name,
        avatarUrl: channel.avatarUrl,
        subscriberCount: channel.subscriberCount,
      },
      isOwner,
      liked: !!like,
      subscribed: !!subscription,
    };
  },
});

/** Other videos to watch next. */
export const upNext = query({
  args: { excludeId: v.string() },
  handler: async (ctx, { excludeId }) => {
    const videos = await ctx.db
      .query('videos')
      .withIndex('by_published', (q) => q.gt('publishedAt', 0))
      .order('desc')
      .take(16);
    return Promise.all(videos.filter((video) => video._id !== excludeId).slice(0, 15).map((video) => withChannel(ctx, video)));
  },
});

export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    if (!text.trim()) return [];
    const videos = await ctx.db
      .query('videos')
      .withSearchIndex('search_title', (q) => q.search('title', text).eq('visibility', 'public').eq('status', 'ready'))
      .take(40);
    return Promise.all(videos.map((video) => withChannel(ctx, video)));
  },
});

/** Studio: every video on the signed-in person's channel, in any state. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const channel = await ctx.db
      .query('channels')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .unique();
    if (!channel) return { channel: null, videos: [] };
    const videos = await ctx.db
      .query('videos')
      .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
      .order('desc')
      .take(500);
    return { channel, videos };
  },
});

// --- Editing ----------------------------------------------------------------------

export const update = mutation({
  args: {
    id: v.id('videos'),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(visibility),
    thumbnailTime: v.optional(v.number()),
    facing: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...changes }) => {
    const { video } = await requireOwnVideo(ctx, id);
    const patch: Partial<Doc<'videos'>> = {};
    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (!title || title.length > 100) throw new ConvexError('Titles are 1–100 characters.');
      patch.title = title;
    }
    if (changes.description !== undefined) patch.description = changes.description.trim().slice(0, 5000);
    if (changes.visibility !== undefined) patch.visibility = changes.visibility;
    if (changes.thumbnailTime !== undefined) patch.thumbnailTime = Math.max(0, changes.thumbnailTime);
    if (changes.facing !== undefined) patch.facing = ((changes.facing % 1) + 1) % 1;
    patch.publishedAt = publishedAt({ ...video, ...patch });
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id('videos') },
  handler: async (ctx, { id }) => {
    const { channel, video } = await requireOwnVideo(ctx, id);
    const [likes, comments] = await Promise.all([
      ctx.db.query('likes').withIndex('by_video', (q) => q.eq('videoId', id)).collect(),
      ctx.db.query('comments').withIndex('by_video', (q) => q.eq('videoId', id)).collect(),
    ]);
    await Promise.all([...likes, ...comments].map((row) => ctx.db.delete(row._id)));
    await ctx.db.delete(id);
    if (video.status === 'ready') await ctx.db.patch(channel._id, { videoCount: Math.max(0, channel.videoCount - 1) });
    if (video.muxAssetId) await ctx.scheduler.runAfter(0, internal.mux.deleteAsset, { assetId: video.muxAssetId });
    else if (video.muxUploadId) await ctx.scheduler.runAfter(0, internal.mux.discardUpload, { uploadId: video.muxUploadId });
  },
});

/** Counts a view. The player calls it once a viewer has watched for a few seconds. */
export const recordView = mutation({
  args: { id: v.id('videos') },
  handler: async (ctx, { id }) => {
    const video = await ctx.db.get(id);
    if (video) await ctx.db.patch(id, { viewCount: video.viewCount + 1 });
  },
});

// --- Upload pipeline (driven by convex/mux.ts) -------------------------------------

/** The browser finished sending the file: start watching Mux for the processed video. */
export const uploadFinished = mutation({
  args: { id: v.id('videos') },
  handler: async (ctx, { id }) => {
    const { video } = await requireOwnVideo(ctx, id);
    if (video.status !== 'uploading') return;
    await ctx.db.patch(id, { status: 'processing' });
    await ctx.scheduler.runAfter(3000, internal.mux.waitForAsset, { videoId: id, attempt: 0 });
  },
});

export const createDraft = internalMutation({
  args: { title: v.string(), visibility },
  handler: async (ctx, { title, visibility }) => {
    const { channel } = await requireChannel(ctx);
    const clean = title.trim().slice(0, 100) || 'Untitled 360° video';
    return ctx.db.insert('videos', {
      channelId: channel._id,
      title: clean,
      description: '',
      visibility,
      status: 'uploading',
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    });
  },
});

/** Removes a draft whose upload never opened. */
export const discardDraft = internalMutation({
  args: { videoId: v.id('videos') },
  handler: async (ctx, { videoId }) => {
    const video = await ctx.db.get(videoId);
    if (video?.status === 'uploading' && !video.muxUploadId) await ctx.db.delete(videoId);
  },
});

export const getInternal = internalQuery({
  args: { videoId: v.id('videos') },
  handler: (ctx, { videoId }) => ctx.db.get(videoId),
});

export const setUpload = internalMutation({
  args: { videoId: v.id('videos'), uploadId: v.string() },
  handler: (ctx, { videoId, uploadId }) => ctx.db.patch(videoId, { muxUploadId: uploadId }),
});

/** Mux has the whole file (noticed by watchUpload): start waiting for it to be processed. */
export const beginProcessing = internalMutation({
  args: { videoId: v.id('videos'), assetId: v.string() },
  handler: async (ctx, { videoId, assetId }) => {
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== 'uploading') return;
    await ctx.db.patch(videoId, { status: 'processing', muxAssetId: assetId });
    await ctx.scheduler.runAfter(0, internal.mux.waitForAsset, { videoId, attempt: 0 });
  },
});

export const setAsset = internalMutation({
  args: { videoId: v.id('videos'), assetId: v.string() },
  handler: (ctx, { videoId, assetId }) => ctx.db.patch(videoId, { muxAssetId: assetId }),
});

export const markReady = internalMutation({
  args: {
    videoId: v.id('videos'),
    playbackId: v.string(),
    duration: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, { videoId, ...ready }) => {
    const video = await ctx.db.get(videoId);
    if (!video || video.status === 'ready') return;
    const next = { ...ready, status: 'ready' as const, thumbnailTime: video.thumbnailTime ?? Math.min(ready.duration * 0.25, 30) };
    await ctx.db.patch(videoId, { ...next, publishedAt: publishedAt({ ...video, ...next }) });
    const channel = await ctx.db.get(video.channelId);
    if (channel) await ctx.db.patch(channel._id, { videoCount: channel.videoCount + 1 });
  },
});

export const markFailed = internalMutation({
  args: { videoId: v.id('videos'), status: v.union(v.literal('errored'), v.literal('rejected')), message: v.string() },
  handler: (ctx, { videoId, status, message }) => ctx.db.patch(videoId, { status, statusMessage: message }),
});
