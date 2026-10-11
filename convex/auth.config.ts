import type { AuthConfig } from 'convex/server';

// Convex trusts session tokens signed by our Clerk app (its "convex" JWT template).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig;
