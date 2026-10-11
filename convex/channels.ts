import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { currentUser, ensureUser, requireChannel } from './lib/auth';

/** Lowercase letters, numbers, dots, dashes and underscores; 3–30 long; starts with a letter or number. */
const HANDLE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

function cleanHandle(handle: string): string {
  const clean = handle.trim().replace(/^@/, '').toLowerCase();
  if (!HANDLE.test(clean)) {
    throw new ConvexError('Handles are 3–30 lowercase letters, numbers, dots, dashes or underscores.');
  }
  return clean;
}

function cleanName(name: string): string {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) throw new ConvexError('Channel names are 1–60 characters.');
  return clean;
}

/** What pages need to show a channel: its row plus its banner's address. */
export async function publicChannel(ctx: QueryCtx, channel: Doc<'channels'>) {
  return {
    ...channel,
    bannerUrl: channel.bannerStorageId ? await ctx.storage.getUrl(channel.bannerStorageId) : null,
  };
}

export const create = mutation({
  args: { handle: v.string(), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ensureUser(ctx);
    const existing = await ctx.db
      .query('channels')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .unique();
    if (existing) throw new ConvexError('You already have a channel.');
    const handle = cleanHandle(args.handle);
    const taken = await ctx.db
      .query('channels')
      .withIndex('by_handle', (q) => q.eq('handle', handle))
      .unique();
    if (taken) throw new ConvexError(`@${handle} is taken.`);
    const id = await ctx.db.insert('channels', {
      ownerId: user._id,
      handle,
      name: cleanName(args.name),
      description: (args.description ?? '').trim().slice(0, 1000),
      avatarUrl: user.imageUrl,
      subscriberCount: 0,
      videoCount: 0,
    });
    return { id, handle };
  },
});

export const update = mutation({
  args: { name: v.optional(v.string()), description: v.optional(v.string()), handle: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { channel } = await requireChannel(ctx);
    const patch: Partial<Doc<'channels'>> = {};
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.description !== undefined) patch.description = args.description.trim().slice(0, 1000);
    if (args.handle !== undefined) {
      const handle = cleanHandle(args.handle);
      if (handle !== channel.handle) {
        const taken = await ctx.db
          .query('channels')
          .withIndex('by_handle', (q) => q.eq('handle', handle))
          .unique();
        if (taken) throw new ConvexError(`@${handle} is taken.`);
        patch.handle = handle;
      }
    }
    await ctx.db.patch(channel._id, patch);
    return { handle: patch.handle ?? channel.handle };
  },
});

/** An address the browser can upload a banner image to. */
export const generateBannerUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireChannel(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const setBanner = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    const { channel } = await requireChannel(ctx);
    if (channel.bannerStorageId) await ctx.storage.delete(channel.bannerStorageId);
    await ctx.db.patch(channel._id, { bannerStorageId: storageId });
  },
});

/** A channel's page: the channel, and how the viewer relates to it. */
export const byHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const channel = await ctx.db
      .query('channels')
      .withIndex('by_handle', (q) => q.eq('handle', handle.toLowerCase()))
      .unique();
    if (!channel) return null;
    const user = await currentUser(ctx);
    const subscription = user
      ? await ctx.db
          .query('subscriptions')
          .withIndex('by_user_channel', (q) => q.eq('userId', user._id).eq('channelId', channel._id))
          .unique()
      : null;
    // Channels without a banner borrow a panorama from their newest video.
    const recent = await ctx.db
      .query('videos')
      .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
      .order('desc')
      .take(20);
    const cover = recent.find((video) => video.publishedAt && video.playbackId);
    return {
      channel: await publicChannel(ctx, channel),
      cover: cover ? { playbackId: cover.playbackId!, thumbnailTime: cover.thumbnailTime, facing: cover.facing } : null,
      isOwner: user?._id === channel.ownerId,
      isSubscribed: !!subscription,
    };
  },
});

/** Whether a handle is free, for the create-channel form to say as you type. */
export const handleAvailable = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const clean = handle.trim().replace(/^@/, '').toLowerCase();
    if (!HANDLE.test(clean)) return { valid: false, available: false };
    const [user, taken] = await Promise.all([
      currentUser(ctx),
      ctx.db
        .query('channels')
        .withIndex('by_handle', (q) => q.eq('handle', clean))
        .unique(),
    ]);
    return { valid: true, available: !taken || taken.ownerId === user?._id };
  },
});

/** Channels the signed-in person subscribes to, for the sidebar. */
export const subscribed = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(100);
    const channels = await Promise.all(subscriptions.map((s) => ctx.db.get(s.channelId)));
    return channels
      .filter((c): c is Doc<'channels'> => c !== null)
      .map(({ _id, handle, name, avatarUrl }) => ({ _id, handle, name, avatarUrl }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    if (!text.trim()) return [];
    const channels = await ctx.db
      .query('channels')
      .withSearchIndex('search_name', (q) => q.search('name', text))
      .take(6);
    return Promise.all(channels.map((c) => publicChannel(ctx, c)));
  },
});
