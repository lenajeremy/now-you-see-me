import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { currentUser, ensureUser } from './lib/auth';

/** Saves (or refreshes) the signed-in person's row. The app calls it after every sign-in. */
export const store = mutation({
  args: {},
  handler: async (ctx) => (await ensureUser(ctx))._id,
});

/** The signed-in person and their channel, if they have one. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const channel = await ctx.db
      .query('channels')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .unique();
    return { user, channel };
  },
});

/**
 * Removes someone and everything they made: their channel and its videos (and
 * the Mux files behind them), comments, likes and subscriptions, keeping the
 * counts on everyone else's videos and channels right. For deleted accounts
 * and test users:  npx convex run users:purge '{"clerkId": "…"}'
 */
export const purge = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', clerkId))
      .unique();
    if (!user) return null;

    const [comments, likes, subscriptions, channel] = await Promise.all([
      ctx.db.query('comments').withIndex('by_author', (q) => q.eq('authorId', user._id)).collect(),
      ctx.db.query('likes').withIndex('by_user_video', (q) => q.eq('userId', user._id)).collect(),
      ctx.db.query('subscriptions').withIndex('by_user', (q) => q.eq('userId', user._id)).collect(),
      ctx.db.query('channels').withIndex('by_owner', (q) => q.eq('ownerId', user._id)).unique(),
    ]);
    for (const comment of comments) {
      const video = await ctx.db.get(comment.videoId);
      if (video) await ctx.db.patch(video._id, { commentCount: Math.max(0, video.commentCount - 1) });
      await ctx.db.delete(comment._id);
    }
    for (const like of likes) {
      const video = await ctx.db.get(like.videoId);
      if (video) await ctx.db.patch(video._id, { likeCount: Math.max(0, video.likeCount - 1) });
      await ctx.db.delete(like._id);
    }
    for (const subscription of subscriptions) {
      const subscribed = await ctx.db.get(subscription.channelId);
      if (subscribed) await ctx.db.patch(subscribed._id, { subscriberCount: Math.max(0, subscribed.subscriberCount - 1) });
      await ctx.db.delete(subscription._id);
    }

    let videos = 0;
    if (channel) {
      const [own, subscribers] = await Promise.all([
        ctx.db.query('videos').withIndex('by_channel', (q) => q.eq('channelId', channel._id)).collect(),
        ctx.db.query('subscriptions').withIndex('by_channel', (q) => q.eq('channelId', channel._id)).collect(),
      ]);
      for (const video of own) {
        const [videoLikes, videoComments] = await Promise.all([
          ctx.db.query('likes').withIndex('by_video', (q) => q.eq('videoId', video._id)).collect(),
          ctx.db.query('comments').withIndex('by_video', (q) => q.eq('videoId', video._id)).collect(),
        ]);
        for (const row of [...videoLikes, ...videoComments]) await ctx.db.delete(row._id);
        if (video.muxAssetId) await ctx.scheduler.runAfter(0, internal.mux.deleteAsset, { assetId: video.muxAssetId });
        else if (video.muxUploadId) await ctx.scheduler.runAfter(0, internal.mux.discardUpload, { uploadId: video.muxUploadId });
        await ctx.db.delete(video._id);
        videos++;
      }
      for (const subscription of subscribers) await ctx.db.delete(subscription._id);
      if (channel.bannerStorageId) await ctx.storage.delete(channel.bannerStorageId);
      await ctx.db.delete(channel._id);
    }
    await ctx.db.delete(user._id);
    return { comments: comments.length, likes: likes.length, subscriptions: subscriptions.length, videos };
  },
});
