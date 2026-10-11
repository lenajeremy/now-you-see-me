import { ConvexError } from 'convex/values';

/** What to tell someone when a Convex call fails: our own messages as written, anything else generically. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data;
  return fallback;
}
