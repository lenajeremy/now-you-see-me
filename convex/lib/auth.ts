import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

/** The signed-in person's user row, or null when signed out (or not stored yet). */
export async function currentUser(ctx: QueryCtx): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query('users')
    .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
    .unique();
}

/** The signed-in person's user row; throws when signed out. */
export async function requireUser(ctx: QueryCtx): Promise<Doc<'users'>> {
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError('Sign in first.');
  return user;
}

/**
 * The signed-in person's user row, saving (or refreshing) it from their Clerk
 * identity first. Mutations use this so they work even before the app has
 * stored a person who has just signed in.
 */
export async function ensureUser(ctx: MutationCtx): Promise<Doc<'users'>> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError('Sign in first.');
  const name = identity.name || identity.nickname || identity.email?.split('@')[0] || 'Viewer';
  const imageUrl = identity.pictureUrl;
  const existing = await ctx.db
    .query('users')
    .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
    .unique();
  if (existing) {
    if (existing.name === name && existing.imageUrl === imageUrl) return existing;
    await ctx.db.patch(existing._id, { name, imageUrl });
    return { ...existing, name, imageUrl };
  }
  const id = await ctx.db.insert('users', { clerkId: identity.subject, name, imageUrl });
  return (await ctx.db.get(id))!;
}

/** The signed-in person's channel; throws when they have none. */
export async function requireChannel(ctx: QueryCtx): Promise<{ user: Doc<'users'>; channel: Doc<'channels'> }> {
  const user = await requireUser(ctx);
  const channel = await ctx.db
    .query('channels')
    .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
    .unique();
  if (!channel) throw new ConvexError('Create your channel first.');
  return { user, channel };
}
