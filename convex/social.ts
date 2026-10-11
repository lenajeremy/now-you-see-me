import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import { currentUser, ensureUser } from './lib/auth';

/** Subscribes to a channel, or unsubscribes if already subscribed. Returns the new state. */
export const toggleSubscription = mutation({
  args: { channelId: v.id('channels') },
  handler: async (ctx, { channelId }) => {
    const user = await ensureUser(ctx);
    const channel = await ctx.db.get(channelId);
    if (!channel) throw new ConvexError('That channel no longer exists.');
    if (channel.ownerId === user._id) throw new ConvexError("You can't subscribe to your own channel.");
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_user_channel', (q) => q.eq('userId', user._id).eq('channelId', channelId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(channelId, { subscriberCount: Math.max(0, channel.subscriberCount - 1) });
      return false;
    }
    await ctx.db.insert('subscriptions', { userId: user._id, channelId });
    await ctx.db.patch(channelId, { subscriberCount: channel.subscriberCount + 1 });
    return true;
  },
});

/** Likes a video, or takes the like back. Returns the new state. */
export const toggleLike = mutation({
  args: { videoId: v.id('videos') },
  handler: async (ctx, { videoId }) => {
    const user = await ensureUser(ctx);
    const video = await ctx.db.get(videoId);
    if (!video) throw new ConvexError('That video no longer exists.');
    const existing = await ctx.db
      .query('likes')
      .withIndex('by_user_video', (q) => q.eq('userId', user._id).eq('videoId', videoId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(videoId, { likeCount: Math.max(0, video.likeCount - 1) });
      return false;
    }
    await ctx.db.insert('likes', { userId: user._id, videoId });
    await ctx.db.patch(videoId, { likeCount: video.likeCount + 1 });
    return true;
  },
});

/** A video's comments, newest first, with who wrote them. */
export const comments = query({
  args: { videoId: v.id('videos'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { videoId, paginationOpts }) => {
    const [user, video] = await Promise.all([currentUser(ctx), ctx.db.get(videoId)]);
    const channel = video && (await ctx.db.get(video.channelId));
    const page = await ctx.db
      .query('comments')
      .withIndex('by_video', (q) => q.eq('videoId', videoId))
      .order('desc')
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (comment) => {
          const author = await ctx.db.get(comment.authorId);
          return {
            ...comment,
            author: { name: author?.name ?? 'Someone', imageUrl: author?.imageUrl },
            isAuthorChannelOwner: comment.authorId === channel?.ownerId,
            // Its author, or the video's owner, may delete it.
            canDelete: !!user && (user._id === comment.authorId || user._id === channel?.ownerId),
          };
        }),
      ),
    };
  },
});

export const addComment = mutation({
  args: { videoId: v.id('videos'), body: v.string() },
  handler: async (ctx, { videoId, body }) => {
    const user = await ensureUser(ctx);
    const text = body.trim();
    if (!text) throw new ConvexError('Write something first.');
    if (text.length > 2000) throw new ConvexError('Comments are up to 2000 characters.');
    const video = await ctx.db.get(videoId);
    if (!video) throw new ConvexError('That video no longer exists.');
    await ctx.db.insert('comments', { videoId, authorId: user._id, body: text });
    await ctx.db.patch(videoId, { commentCount: video.commentCount + 1 });
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id('comments') },
  handler: async (ctx, { commentId }) => {
    const user = await ensureUser(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) return;
    const video = await ctx.db.get(comment.videoId);
    const channel = video && (await ctx.db.get(video.channelId));
    if (comment.authorId !== user._id && channel?.ownerId !== user._id) {
      throw new ConvexError('Only its author or the video’s owner can delete a comment.');
    }
    await ctx.db.delete(commentId);
    if (video) await ctx.db.patch(video._id, { commentCount: Math.max(0, video.commentCount - 1) });
  },
});

export const report = mutation({
  args: { targetType: v.union(v.literal('video'), v.literal('comment')), targetId: v.string(), reason: v.string() },
  handler: async (ctx, { targetType, targetId, reason }) => {
    const user = await ensureUser(ctx);
    const text = reason.trim().slice(0, 1000);
    if (!text) throw new ConvexError('Say what’s wrong.');
    await ctx.db.insert('reports', { reporterId: user._id, targetType, targetId, reason: text, status: 'open' });
  },
});
