import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const visibility = v.union(v.literal('public'), v.literal('unlisted'), v.literal('private'));

export const videoStatus = v.union(
  /** The file is on its way to Mux. */
  v.literal('uploading'),
  /** Mux has it and is transcoding. */
  v.literal('processing'),
  v.literal('ready'),
  /** Mux couldn't process it. */
  v.literal('errored'),
  /** Processed, but it isn't a 360° video. */
  v.literal('rejected'),
);

export default defineSchema({
  /** Everyone who has signed in, mirrored from Clerk. */
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
  }).index('by_clerk', ['clerkId']),

  /** One per person who uploads. Its handle is its address: /@handle. */
  channels: defineTable({
    ownerId: v.id('users'),
    handle: v.string(),
    name: v.string(),
    description: v.string(),
    avatarUrl: v.optional(v.string()),
    bannerStorageId: v.optional(v.id('_storage')),
    subscriberCount: v.number(),
    videoCount: v.number(),
  })
    .index('by_handle', ['handle'])
    .index('by_owner', ['ownerId'])
    .searchIndex('search_name', { searchField: 'name' }),

  videos: defineTable({
    channelId: v.id('channels'),
    title: v.string(),
    description: v.string(),
    visibility,
    status: videoStatus,
    /** Why it errored or was rejected, in words for its owner. */
    statusMessage: v.optional(v.string()),
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    playbackId: v.optional(v.string()),
    duration: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    /** Second of the video its thumbnail comes from. */
    thumbnailTime: v.optional(v.number()),
    /** How far across the panorama (0–1) the part in front of the viewer is, at the start. */
    facing: v.optional(v.number()),
    viewCount: v.number(),
    likeCount: v.number(),
    commentCount: v.number(),
    /** Set when it's both ready and public: it then appears in feeds. */
    publishedAt: v.optional(v.number()),
  })
    .index('by_channel', ['channelId'])
    .index('by_upload', ['muxUploadId'])
    .index('by_published', ['publishedAt'])
    .searchIndex('search_title', { searchField: 'title', filterFields: ['visibility', 'status'] }),

  subscriptions: defineTable({
    userId: v.id('users'),
    channelId: v.id('channels'),
  })
    .index('by_user', ['userId'])
    .index('by_channel', ['channelId'])
    .index('by_user_channel', ['userId', 'channelId']),

  likes: defineTable({
    userId: v.id('users'),
    videoId: v.id('videos'),
  })
    .index('by_user_video', ['userId', 'videoId'])
    .index('by_video', ['videoId']),

  comments: defineTable({
    videoId: v.id('videos'),
    authorId: v.id('users'),
    body: v.string(),
  })
    .index('by_video', ['videoId'])
    .index('by_author', ['authorId']),

  /** A watch-together session: up to two people in the same video, in sync, on a call. */
  parties: defineTable({
    videoId: v.id('videos'),
    hostId: v.id('users'),
    /** Where playback was at `at` (server time), and whether it was moving. */
    playing: v.boolean(),
    position: v.number(),
    at: v.number(),
    /** The tab that made the last change, so it doesn't apply its own. */
    updatedBy: v.optional(v.string()),
  }),

  /** Who's in a party right now: one row per open tab, kept fresh by heartbeats. */
  partyMembers: defineTable({
    partyId: v.id('parties'),
    userId: v.id('users'),
    /** Random per tab. */
    peerId: v.string(),
    lastSeen: v.number(),
  })
    .index('by_party', ['partyId'])
    .index('by_peer', ['peerId']),

  /** Call set-up messages (offers, answers, network candidates) waiting for the other tab. */
  signals: defineTable({
    partyId: v.id('parties'),
    from: v.string(),
    to: v.string(),
    /** A Signal (src/world/signaling.ts), as JSON. */
    body: v.string(),
  }).index('by_to', ['to']),

  reports: defineTable({
    reporterId: v.id('users'),
    targetType: v.union(v.literal('video'), v.literal('comment')),
    targetId: v.string(),
    reason: v.string(),
    status: v.union(v.literal('open'), v.literal('resolved')),
  }).index('by_status', ['status']),
});
