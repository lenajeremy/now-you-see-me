# Now You See Me — plan

**Concept.** Each laptop is its own 3D world. A call links two worlds: each person sees the
other's live webcam on a big screen in their own world, and hears them from it. Each laptop
shows its world split-screen: **outside view | first-person view**.

## How it works

- **App:** Vite + TypeScript + Three.js. One canvas, drawn twice per frame — left from an
  orbit camera, right from the person's eyes. HTML divider on top: drag it, collapse either side.
- **World (hybrid):** a free 360° photo projected onto a ground dome, so the person appears to
  stand on the photo's ground. Floor shadows, the screen and the figure are real 3D objects.
- **The person:** stands at a fixed spot at eye height (1.6 m). Click-drag to look. Outside view
  only: a plain figure plus a see-through view cone that turns with your gaze.
- **The screen:** ~4.5 m ahead, fixed in place, filling a large part of the first-person view
  when you face it. Shows the caller's video as a live texture; reshapes to their camera's
  aspect ratio.
- **Sound:** the caller's voice is a 3D sound source on the screen; your ears are the
  first-person camera — turn away and it moves to one side and softens.
- **Call:** direct WebRTC connection between the laptops (video + audio straight across the
  Wi-Fi). A small connection server built into the dev server only introduces the two laptops
  and passes ring / answer / hang-up messages.
- **Running it:** `npm run dev` serves over HTTPS on the local network (HTTPS is required for
  the second laptop to use its camera).

## Call flow

1. Open the app → get a room link → **Copy link**.
2. The other person opens it on their laptop → their screen shows "Calling…".
3. Your screen rings (glow + ringtone coming from the screen) → click the screen or **Answer**,
   or **Decline**.
4. Both screens show the other's webcam. Mute, camera off, hang up. Either side hangs up →
   both screens return to idle.

## Phases

**Phase 1 — the world, solo.** ✅ Done. Project setup, world, figure + view cone, split screen with
draggable divider and collapse, look/orbit controls, the screen playing your own webcam as a
stand-in caller.
*Done when:* you can look around in first person, orbit outside, watch the cone follow your
gaze, and see live video on the screen.

**Phase 2 — the call.** ✅ Built; passes a two-browser test on one Mac, still needs a real two-laptop test. Local HTTPS, connection server, room links, ring / answer / decline /
hang up, WebRTC video + audio, 3D voice from the screen.
*Done when:* this Mac and a second laptop on the same Wi-Fi call each other, and each sees and
hears the other in their own world.

**Phase 3 — more.** ✅ Backdrop picker: photo or video worlds with looping ambient sound
(ducked during calls), cross-fades, remembered choice. ✅ Sharper call video (1080p from the
start, hardware H.264 on Macs). Still to do: multiple standpoints (jump between spots, or click
markers in the outside view), nicer screen states. Later: host online so calls work across
networks; VR headset support.

## Defaults

- Click-and-drag to look (no mouse capture). Keys: `1` outside only, `2` both, `3` first-person only.
- Small mirrored self-view in a corner of the first-person pane (an overlay, not in the world).
- Both worlds use the same 360° backdrop to start.
- 1:1 calls only; Chrome on both laptops.

## Things to know

- **Certificate warning:** local HTTPS uses a self-signed certificate, so each browser shows a
  "not private" warning once — click Advanced → Proceed.
- **Echo:** routing the voice through 3D audio can weaken the browser's echo cancellation. Use
  headphones on at least one laptop for first tests.
- **macOS firewall:** allow incoming connections for Node if asked, or the second laptop can't
  reach you.
