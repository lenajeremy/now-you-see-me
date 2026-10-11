'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useConvex } from 'convex/react';
import type { Id } from '@convex/_generated/dataModel';
import { PartyController } from './party-controller';

// The page's party, kept outside React (there's at most one at a time).
let active: PartyController | null = null;
const listeners = new Set<() => void>();
function setActive(controller: PartyController | null) {
  active = controller;
  listeners.forEach((listener) => listener());
}
const subscribeActive = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const NONE = () => () => {};

/**
 * This tab's id in the party. Kept for the tab's life, so a reload rejoins as
 * the same member rather than leaving a ghost that makes the party look full.
 */
function peerIdFor(partyId: string): string {
  const key = `nysm.peer.${partyId}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
const ZERO = () => 0;

/** The watch party in `partyId`, joined from this tab for as long as `enabled`. */
export function useParty(partyId: Id<'parties'> | null, userId: Id<'users'> | null, enabled: boolean) {
  const client = useConvex();

  useEffect(() => {
    if (!partyId || !userId || !enabled) return;
    const party = new PartyController(client, partyId, peerIdFor(partyId), userId);
    setActive(party);
    void party.start();
    const leave = () => party.dispose();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      party.dispose();
      if (active === party) setActive(null);
    };
  }, [client, partyId, userId, enabled]);

  const controller = useSyncExternalStore(subscribeActive, () => active, () => null);
  // Re-render on every change in the party or the call.
  useSyncExternalStore(controller?.subscribe ?? NONE, controller?.getVersion ?? ZERO, ZERO);
  return controller;
}
