'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc } from '@convex/_generated/dataModel';

export type Me =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'ready'; user: Doc<'users'>; channel: Doc<'channels'> | null };

/** The signed-in person and their channel, as Convex knows them. */
export function useMe(): Me {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
  if (isLoading) return { status: 'loading' };
  if (!isAuthenticated) return { status: 'signed-out' };
  // null until the app has saved someone who has just signed in.
  if (!me) return { status: 'loading' };
  return { status: 'ready', user: me.user, channel: me.channel };
}
