import { cacheLife } from 'next/cache';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';

/*
 * What link previews and tab titles need, fetched as a signed-out visitor
 * (so only public and unlisted things) and cached for a few minutes.
 */

export async function videoForMetadata(id: string) {
  'use cache';
  cacheLife('minutes');
  return fetchQuery(api.videos.get, { id }).catch(() => null);
}

export async function channelForMetadata(handle: string) {
  'use cache';
  cacheLife('minutes');
  return fetchQuery(api.channels.byHandle, { handle }).catch(() => null);
}
