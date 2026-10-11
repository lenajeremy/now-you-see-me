import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { internal } from './_generated/api';
import { currentUser, ensureUser } from './lib/auth';

/** Two people: the call underneath is one-to-one. */
const MAX_MEMBERS = 2;
/** Tabs heartbeat every 10 s; one silent for this long has gone. */
const STALE_MS = 30_000;
/** Invite links work for this long, whether or not anyone is in the party right now. */
const PARTY_LIFETIME_MS = 24 * 60 * 60 * 1000;

async function requireMember(ctx: QueryCtx, peerId: string): Promise<Doc<'partyMembers'>> {
  const user = await currentUser(ctx);
  const member = await ctx.db
    .query('partyMembers')
    .withIndex('by_peer', (q) => q.eq('peerId', peerId))
    .unique();
  if (!user || !member || member.userId !== user._id) throw new ConvexError('You’re not in this watch party.');
  return member;
}

async function removeMember(ctx: MutationCtx, member: Doc<'partyMembers'>) {
  const inbox = await ctx.db
    .query('signals')
    .withIndex('by_to', (q) => q.eq('to', member.peerId))
    .collect();
  for (const signal of inbox) await ctx.db.delete(signal._id);
  await ctx.db.delete(member._id);
}

/** Starts a watch party for a video, with you as host. */
export const create = mutation({
  args: { videoId: v.id('videos') },
  handler: async (ctx, { videoId }) => {
    const user = await ensureUser(ctx);
    const video = await ctx.db.get(videoId);
    if (!video || video.status !== 'ready') throw new ConvexError('That video can’t be watched right now.');
    const channel = await ctx.db.get(video.channelId);
    if (video.visibility === 'private' && channel?.ownerId !== user._id) {
      throw new ConvexError('Private videos can’t be watched together.');
    }
    const partyId = await ctx.db.insert('parties', { videoId, hostId: user._id, playing: false, position: 0, at: Date.now() });
    await ctx.scheduler.runAfter(PARTY_LIFETIME_MS, internal.parties.end, { partyId });
    return partyId;
  },
});

/** Ends a party at the end of its life: it, its members and their signals. */
export const end = internalMutation({
  args: { partyId: v.id('parties') },
  handler: async (ctx, { partyId }) => {
    const members = await ctx.db
      .query('partyMembers')
      .withIndex('by_party', (q) => q.eq('partyId', partyId))
      .collect();
    for (const member of members) await removeMember(ctx, member);
    if (await ctx.db.get(partyId)) await ctx.db.delete(partyId);
  },
});

/** The party: its video, playback, and who's in it. Null if it doesn't exist. */
export const get = query({
  args: { partyId: v.string() },
  handler: async (ctx, { partyId }) => {
    const id = ctx.db.normalizeId('parties', partyId);
    const party = id && (await ctx.db.get(id));
    if (!party) return null;
    const [host, members] = await Promise.all([
      ctx.db.get(party.hostId),
      ctx.db
        .query('partyMembers')
        .withIndex('by_party', (q) => q.eq('partyId', party._id))
        .collect(),
    ]);
    return {
      ...party,
      host: { name: host?.name ?? 'Someone', imageUrl: host?.imageUrl },
      members: await Promise.all(
        members.map(async (m) => {
          const user = await ctx.db.get(m.userId);
          return { peerId: m.peerId, userId: m.userId, name: user?.name ?? 'Someone', imageUrl: user?.imageUrl };
        }),
      ),
    };
  },
});

/** Joins from this tab. Returns how many others are there, or that it's full. */
export const join = mutation({
  args: { partyId: v.id('parties'), peerId: v.string() },
  handler: async (ctx, { partyId, peerId }) => {
    const user = await ensureUser(ctx);
    const party = await ctx.db.get(partyId);
    if (!party) throw new ConvexError('This watch party has ended.');
    const now = Date.now();
    const members = await ctx.db
      .query('partyMembers')
      .withIndex('by_party', (q) => q.eq('partyId', partyId))
      .collect();
    // Tidy up tabs that went away without saying so. (The same person in two
    // windows is fine: handy for trying it out alone.)
    const present: Doc<'partyMembers'>[] = [];
    for (const member of members) {
      if (member.peerId === peerId) continue;
      if (now - member.lastSeen > STALE_MS) await removeMember(ctx, member);
      else present.push(member);
    }
    if (present.length >= MAX_MEMBERS) return { full: true as const, others: present.length, serverNow: now };
    const existing = members.find((m) => m.peerId === peerId);
    if (existing) await ctx.db.patch(existing._id, { lastSeen: now });
    else {
      const memberId = await ctx.db.insert('partyMembers', { partyId, userId: user._id, peerId, lastSeen: now });
      await ctx.scheduler.runAfter(STALE_MS, internal.parties.expire, { memberId });
    }
    return { full: false as const, others: present.length, serverNow: now };
  },
});

/** "Still here." Also tells the tab the server's clock, to sync playback. */
export const heartbeat = mutation({
  args: { peerId: v.string() },
  handler: async (ctx, { peerId }) => {
    const member = await ctx.db
      .query('partyMembers')
      .withIndex('by_peer', (q) => q.eq('peerId', peerId))
      .unique();
    const now = Date.now();
    if (member) await ctx.db.patch(member._id, { lastSeen: now });
    return { present: !!member, serverNow: now };
  },
});

/** Drops a tab that stopped sending heartbeats; otherwise checks again later. */
export const expire = internalMutation({
  args: { memberId: v.id('partyMembers') },
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member) return;
    const silentFor = Date.now() - member.lastSeen;
    if (silentFor > STALE_MS) {
      await removeMember(ctx, member);
    } else {
      await ctx.scheduler.runAfter(STALE_MS - silentFor + 1000, internal.parties.expire, { memberId });
    }
  },
});

export const leave = mutation({
  args: { peerId: v.string() },
  handler: async (ctx, { peerId }) => {
    const member = await ctx.db
      .query('partyMembers')
      .withIndex('by_peer', (q) => q.eq('peerId', peerId))
      .unique();
    if (member) await removeMember(ctx, member);
  },
});

/** Sends a call signal to the other person in the party. */
export const send = mutation({
  args: { peerId: v.string(), body: v.string() },
  handler: async (ctx, { peerId, body }) => {
    if (body.length > 64_000) throw new ConvexError('Signal too large.');
    const member = await requireMember(ctx, peerId);
    const others = await ctx.db
      .query('partyMembers')
      .withIndex('by_party', (q) => q.eq('partyId', member.partyId))
      .collect();
    for (const other of others) {
      if (other.peerId !== peerId) await ctx.db.insert('signals', { partyId: member.partyId, from: peerId, to: other.peerId, body });
    }
  },
});

/** Signals waiting for this tab, oldest first. */
export const inbox = query({
  args: { peerId: v.string() },
  handler: async (ctx, { peerId }) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    const signals = await ctx.db
      .query('signals')
      .withIndex('by_to', (q) => q.eq('to', peerId))
      .take(100);
    return signals.map(({ _id, from, body }) => ({ _id, from, body }));
  },
});

/** Clears signals this tab has handled. */
export const ack = mutation({
  args: { peerId: v.string(), ids: v.array(v.id('signals')) },
  handler: async (ctx, { peerId, ids }) => {
    await requireMember(ctx, peerId);
    for (const id of ids) {
      const signal = await ctx.db.get(id);
      if (signal?.to === peerId) await ctx.db.delete(id);
    }
  },
});

/** Play, pause or seek for everyone in the party. */
export const setPlayback = mutation({
  args: { peerId: v.string(), playing: v.boolean(), position: v.number() },
  handler: async (ctx, { peerId, playing, position }) => {
    const member = await requireMember(ctx, peerId);
    await ctx.db.patch(member.partyId, { playing, position: Math.max(0, position), at: Date.now(), updatedBy: peerId });
  },
});
