# Now You See Me

**Video you can stand inside.** A platform for 360° video: upload it, watch it from the
middle of the scene, look all the way round, step outside to see yourself standing there,
and call a friend in to watch together.

**Live:** https://now-you-see-me-three.vercel.app

## What you can do

- **Watch in 3D.** Every video plays inside a Three.js world. Drag (or swipe) to look around;
  switch between first person, an outside view of your figure in the scene, or both side by side.
- **Watch together.** Start a party from any video and send the link. You're both at the same
  moment — play, pause and seek follow each other — on a video call, with each other's camera
  on a screen standing inside the video.
- **Upload.** Drag in a 360° video (2:1 equirectangular). It's checked in the browser, previewed
  in 3D while it uploads, and streamed in up to 4K once processed.
- **Channels.** Subscribe, like, comment, share and report. Studio lists your videos with their
  status, and lets you pick each one's thumbnail moment and the direction viewers face first.

## Stack

| | |
|---|---|
| App | [Next.js 16](https://nextjs.org) (App Router, Cache Components), React 19, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) on Base UI |
| 3D | [Three.js](https://threejs.org): the video on a ground-projected sky dome, a figure, an in-world screen, positional audio |
| Data | [Convex](https://convex.dev): database, queries, mutations, scheduled jobs, and the call's signalling |
| Sign-in | [Clerk](https://clerk.com): email and password, Google |
| Video | [Mux](https://mux.com): direct uploads, encoding, HLS streaming (played with hls.js) |
| Calls | WebRTC, with a [Cloudflare](https://developers.cloudflare.com/realtime/turn/) TURN relay when configured |
| Hosting | [Vercel](https://vercel.com) |

## How it fits together

```
src/world/        the 3D engine: world, figure, look controls, split view, in-world screen, audio, WebRTC call
src/components/   player, watch page, Studio, feeds, channels, onboarding tour, app shell
src/app/          routes: /, /watch/[id], /@handle, /results, /feed/subscriptions, /studio, /studio/upload
convex/           schema and functions: videos, channels, social, Mux pipeline, watch parties, seeding
scripts/          content tools: seed and import openly licensed 360° video, make backdrops
```

**Uploading.** The browser asks Convex for a Mux upload address and sends the file straight to
Mux in resumable chunks. Convex then follows the upload until Mux has processed it, checks that
it really is 360° (twice as wide as it is tall), and publishes it — or rejects it, deleting it
from Mux.

**Watching together.** A party is a Convex document holding the shared playback position. Each
tab joins as a member and sends heartbeats; call set-up messages (offers, answers, network
candidates) pass through a per-tab inbox, so no separate signalling server is needed.

## Run it locally

You need accounts on Convex, Clerk and Mux.

```sh
npm install
cp .env.example .env.local      # add your Clerk keys
npx convex dev                   # creates a Convex deployment, writes its address to .env.local
```

Then, once:

1. In Clerk, create a **JWT template** named `convex` (Clerk's Convex preset).
2. Set the server-side settings in Convex:
   ```sh
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-instance>.clerk.accounts.dev
   npx convex env set MUX_TOKEN_ID <id>
   npx convex env set MUX_TOKEN_SECRET <secret>
   ```
   Optionally `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` for the call relay.

Keep `npx convex dev` running, and in another terminal:

```sh
npm run dev                      # http://localhost:3000
```

`npm run typecheck` and `npm run lint` check the code.

## Deploy

Convex functions deploy from your machine; Vercel builds the site.

```sh
npx convex deploy -y             # to the production Convex deployment
vercel deploy --prod             # NEXT_PUBLIC_CONVEX_URL must point at that deployment in Vercel
```

## Content

Besides people's own uploads, the site is seeded with openly licensed 360° video from
[Wikimedia Commons](https://commons.wikimedia.org) (NASA, and many independent filmmakers),
in channels run by the site. Every video's description names who made it, its licence, and
links to the original. `scripts/commons-360.json` lists them; `node scripts/import-commons.mjs`
imports them.

## Background

This started as a two-laptop prototype — each laptop its own 3D world, joined by a call — and
grew into the platform. The original design is in [docs/prototype-plan.md](docs/prototype-plan.md).
