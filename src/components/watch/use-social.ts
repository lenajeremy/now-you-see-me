'use client';

import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';

/** Subscribe/unsubscribe, showing the change at once wherever the channel is on screen. */
export function useToggleSubscription() {
  return useMutation(api.social.toggleSubscription).withOptimisticUpdate((store, { channelId }) => {
    for (const { args, value } of store.getAllQueries(api.videos.get)) {
      if (!value || value.channel._id !== channelId) continue;
      const subscribed = !value.subscribed;
      store.setQuery(api.videos.get, args, {
        ...value,
        subscribed,
        channel: { ...value.channel, subscriberCount: Math.max(0, value.channel.subscriberCount + (subscribed ? 1 : -1)) },
      });
    }
    for (const { args, value } of store.getAllQueries(api.channels.byHandle)) {
      if (!value || value.channel._id !== channelId) continue;
      const isSubscribed = !value.isSubscribed;
      store.setQuery(api.channels.byHandle, args, {
        ...value,
        isSubscribed,
        channel: { ...value.channel, subscriberCount: Math.max(0, value.channel.subscriberCount + (isSubscribed ? 1 : -1)) },
      });
    }
  });
}

/** Like/unlike, showing the change at once. */
export function useToggleLike() {
  return useMutation(api.social.toggleLike).withOptimisticUpdate((store, { videoId }) => {
    for (const { args, value } of store.getAllQueries(api.videos.get)) {
      if (!value || value.video._id !== videoId) continue;
      const liked = !value.liked;
      store.setQuery(api.videos.get, args, {
        ...value,
        liked,
        video: { ...value.video, likeCount: Math.max(0, value.video.likeCount + (liked ? 1 : -1)) },
      });
    }
  });
}
