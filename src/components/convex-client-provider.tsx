'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ConvexReactClient, useConvexAuth, useMutation } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { useAuth } from '@clerk/nextjs';
import { api } from '@convex/_generated/api';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Talks to Convex as whoever is signed in with Clerk. Sits inside ClerkProvider. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <StoreUser />
      {children}
    </ConvexProviderWithClerk>
  );
}

/** Saves the signed-in person in Convex (name and picture from Clerk) once per sign-in. */
function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const store = useMutation(api.users.store);
  const stored = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId || stored.current === userId) return;
    stored.current = userId;
    store().catch(() => {
      stored.current = null;
    });
  }, [isAuthenticated, userId, store]);

  return null;
}
