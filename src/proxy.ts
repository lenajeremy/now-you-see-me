import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Pages only for signed-in people. Sending everyone else to sign in here,
 * before rendering, keeps those pages' shells static. Their data is guarded
 * separately: Convex checks who's asking on every query and mutation.
 */
const SIGNED_IN_ONLY = /^\/(studio|feed\/subscriptions)(\/|$)/;

export default clerkMiddleware(
  async (auth, request) => {
    if (SIGNED_IN_ONLY.test(request.nextUrl.pathname)) await auth.protect();
  },
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' },
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|m3u8)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
