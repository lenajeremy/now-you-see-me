'use client';

import type { ConvexReactClient } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { CallSession, type CallState } from '@/world/call';
import type { WorldEngine } from '@/world/engine';
import { openLocalMedia } from '@/world/media';
import type { ConnectSignaling, Signal } from '@/world/signaling';

export type Party = NonNullable<FunctionReturnType<typeof api.parties.get>>;

export type PartyStatus =
  /** Joining, opening the camera, finding a route. */
  | 'starting'
  | 'active'
  /** Two people are already in it. */
  | 'full'
  /** It no longer exists (parties last a day). */
  | 'gone'
  | 'error';

/** Playback differences smaller than this (seconds) are left alone. */
const IN_SYNC = 1;
/** While playing, drift beyond this gets corrected. */
const MAX_DRIFT = 1.5;
const HEARTBEAT_MS = 10_000;

/**
 * One tab's part in a watch party: membership and heartbeats, the call (with
 * Convex carrying its set-up messages), the other person on the in-world
 * screen, and keeping both videos at the same moment.
 */
export class PartyController {
  status: PartyStatus = 'starting';
  error: string | null = null;
  call: CallSession | null = null;
  local: MediaStream | null = null;
  mediaProblem: string | null = null;
  party: Party | null = null;

  private readonly listeners = new Set<() => void>();
  private readonly cleanups: (() => void)[] = [];
  private disposed = false;
  /** Server time minus local time, in ms. */
  private clockOffset = 0;
  private engine: WorldEngine | null = null;
  private video: HTMLVideoElement | null = null;
  private remoteVideo: HTMLVideoElement | null = null;
  private appliedAt = 0;
  private version = 0;
  /** Playback has been lined up with the party once. */
  private synced = false;
  /** The next seeked/play/pause event is our own doing, not the person's. */
  private expect = { seeked: false, play: false, pause: false };
  private lastLocalChange = 0;

  constructor(
    private readonly client: ConvexReactClient,
    readonly partyId: Id<'parties'>,
    readonly peerId: string,
    /** The signed-in person; the host starts the party at their own moment in the video. */
    private readonly userId: Id<'users'>,
  ) {}

  /** For useSyncExternalStore. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = () => this.version;

  private changed() {
    this.version++;
    this.render();
    this.listeners.forEach((l) => l());
  }

  get isHost(): boolean {
    return !!this.party && this.party.hostId === this.userId;
  }

  /** Joins, opens the camera and microphone, and gets the call ready. */
  async start(): Promise<void> {
    try {
      const sentAt = Date.now();
      const joined = await this.client.mutation(api.parties.join, { partyId: this.partyId, peerId: this.peerId });
      this.syncClock(sentAt, joined.serverNow);
      if (this.disposed) return;
      if (joined.full) {
        this.status = 'full';
        return this.changed();
      }

      this.watchParty();
      const [media, iceServers] = await Promise.all([
        openLocalMedia(),
        this.client.action(api.calls.iceServers, {}).catch(() => undefined),
      ]);
      if (this.disposed) {
        media.stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      this.local = media.stream;
      this.mediaProblem = media.problem;
      this.call = new CallSession(this.connect(joined.others), media.stream, iceServers);
      this.call.onChange = () => this.changed();

      const beat = window.setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
      // Phones pause hidden pages; check in as soon as this one is back.
      const onVisible = () => document.visibilityState === 'visible' && void this.heartbeat();
      document.addEventListener('visibilitychange', onVisible);
      this.cleanups.push(() => {
        window.clearInterval(beat);
        document.removeEventListener('visibilitychange', onVisible);
      });
      this.status = 'active';
      this.changed();
    } catch (error) {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : 'Couldn’t join the watch party.';
      this.changed();
    }
  }

  /** Hooks the party up to the player once its world and video exist. */
  attach(engine: WorldEngine, video: HTMLVideoElement) {
    if (this.engine === engine && this.video === video) return;
    this.engine = engine;
    this.video = video;
    engine.screen.setVisible(true);

    const remote = document.createElement('video');
    remote.playsInline = true;
    remote.muted = true; // their voice comes out of the screen, through the world's audio
    this.remoteVideo = remote;

    const events = new AbortController();
    for (const type of ['play', 'pause', 'seeked'] as const) {
      video.addEventListener(type, () => this.onLocalPlayback(type), { signal: events.signal });
    }
    const drift = window.setInterval(() => this.correctDrift(), 3000);
    this.cleanups.push(() => {
      events.abort();
      window.clearInterval(drift);
    });
    this.applyParty();
    this.changed();
  }

  /** Leaves the party and hangs up. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.call?.leave();
    this.local?.getTracks().forEach((t) => t.stop());
    this.cleanups.forEach((fn) => fn());
    if (this.engine) {
      this.engine.screenAction = null;
      this.engine.audio.setVoice(null);
      this.engine.audio.setTone(null);
      this.engine.audio.duckAmbience(false);
      this.engine.screen.setVisible(false);
    }
    if (this.remoteVideo) this.remoteVideo.srcObject = null;
    void this.client.mutation(api.parties.leave, { peerId: this.peerId }).catch(() => {});
  }

  // --- Membership -------------------------------------------------------------------

  private syncClock(sentAt: number, serverNow: number) {
    const now = Date.now();
    this.clockOffset = serverNow - (sentAt + now) / 2;
  }

  private serverNow() {
    return Date.now() + this.clockOffset;
  }

  private async heartbeat() {
    try {
      const sentAt = Date.now();
      const { present, serverNow } = await this.client.mutation(api.parties.heartbeat, { peerId: this.peerId });
      this.syncClock(sentAt, serverNow);
      // Dropped while this page was asleep in the background: come back in.
      if (!present && !this.disposed && this.status === 'active') {
        const joined = await this.client.mutation(api.parties.join, { partyId: this.partyId, peerId: this.peerId });
        if (joined.full) {
          this.status = 'full';
          this.call?.leave();
          this.changed();
        }
      }
    } catch {
      // The next one will try again.
    }
  }

  private watchParty() {
    const watch = this.client.watchQuery(api.parties.get, { partyId: this.partyId });
    const update = () => {
      const party = watch.localQueryResult();
      if (party === undefined) return;
      if (party === null) {
        if (this.status === 'active' || this.status === 'starting') {
          this.status = 'gone';
          this.call?.leave();
        }
        return this.changed();
      }
      this.party = party;
      this.applyParty();
      this.changed();
    };
    this.cleanups.push(watch.onUpdate(update));
    update();
  }

  /** Convex as the call's go-between: presence from the party, messages through an inbox. */
  private connect(othersAtJoin: number): ConnectSignaling {
    return (handlers) => {
      let othersHere = othersAtJoin > 0;
      const members = this.client.watchQuery(api.parties.get, { partyId: this.partyId });
      const checkMembers = () => {
        const party = members.localQueryResult();
        if (!party) return;
        const here = party.members.some((m) => m.peerId !== this.peerId);
        if (here && !othersHere) handlers.onPeerJoined();
        if (!here && othersHere) handlers.onPeerLeft();
        othersHere = here;
      };
      const offMembers = members.onUpdate(checkMembers);
      // Someone may have joined while the camera prompt was up: check what's there now too.
      queueMicrotask(() => {
        handlers.onJoined(othersAtJoin);
        checkMembers();
      });

      const seen = new Set<string>();
      const inbox = this.client.watchQuery(api.parties.inbox, { peerId: this.peerId });
      const offInbox = inbox.onUpdate(() => {
        const fresh = (inbox.localQueryResult() ?? []).filter((s) => !seen.has(s._id));
        if (!fresh.length) return;
        for (const signal of fresh) {
          seen.add(signal._id);
          handlers.onSignal(JSON.parse(signal.body) as Signal);
        }
        void this.client.mutation(api.parties.ack, { peerId: this.peerId, ids: fresh.map((s) => s._id) }).catch(() => {});
      });

      return {
        // Mutations from one tab run in the order they're sent, so an offer always precedes its candidates.
        send: (signal) => void this.client.mutation(api.parties.send, { peerId: this.peerId, body: JSON.stringify(signal) }).catch(() => {}),
        close: () => {
          offMembers();
          offInbox();
        },
      };
    };
  }

  // --- Playback ---------------------------------------------------------------------

  /** Where the party says playback is right now. */
  private expectedPosition(party: Party): number {
    return party.position + (party.playing ? Math.max(0, this.serverNow() - party.at) / 1000 : 0);
  }

  /** Follows the party's play/pause/seek, unless this tab made the change. */
  private applyParty() {
    const party = this.party;
    const video = this.video;
    if (!party || !video) return;
    if (!this.synced) {
      this.synced = true;
      this.appliedAt = party.at;
      // Nobody has set playback yet: the host's current moment becomes the party's.
      if (!party.updatedBy && this.isHost) return this.pushPlayback();
      return this.follow(party);
    }
    if (party.at === this.appliedAt) return;
    this.appliedAt = party.at;
    if (party.updatedBy !== this.peerId) this.follow(party);
  }

  /** Moves this video to where the party is, marking the events that causes as ours. */
  private follow(party: Party) {
    const video = this.video;
    if (!video) return;
    const target = this.expectedPosition(party);
    if (Math.abs(video.currentTime - target) > IN_SYNC) {
      this.expect.seeked = true;
      video.currentTime = Math.min(target, (video.duration || target + 1) - 0.25);
    }
    if (party.playing && video.paused) {
      this.expect.play = true;
      void video.play().catch(() => (this.expect.play = false));
    }
    if (!party.playing && !video.paused) {
      this.expect.pause = true;
      video.pause();
    }
  }

  /** The person here played, paused or seeked: tell the party (but not about our own catching up). */
  private onLocalPlayback(type: 'play' | 'pause' | 'seeked') {
    if (this.expect[type]) {
      this.expect[type] = false;
      return;
    }
    const party = this.party;
    const video = this.video;
    if (!party || !video || this.status !== 'active') return;
    const playing = !video.paused;
    if (playing === party.playing && Math.abs(video.currentTime - this.expectedPosition(party)) < IN_SYNC) return;
    this.pushPlayback();
  }

  private pushPlayback() {
    const video = this.video;
    if (!video) return;
    this.lastLocalChange = performance.now();
    void this.client
      .mutation(api.parties.setPlayback, { peerId: this.peerId, playing: !video.paused, position: video.currentTime })
      .catch(() => {});
  }

  /** Every few seconds, quietly catches up if this video has wandered from the party. */
  private correctDrift() {
    const party = this.party;
    const video = this.video;
    if (!party || !video || video.seeking || video.readyState < 1) return;
    // Leave it alone right after the person here changed something; the party is catching up.
    if (performance.now() - this.lastLocalChange < 2500) return;
    const drift = Math.abs(video.currentTime - this.expectedPosition(party));
    if (drift > (party.playing ? MAX_DRIFT : IN_SYNC) || party.playing === video.paused) this.follow(party);
  }

  // --- The world: their camera on the screen, their voice from it ------------------

  private render() {
    const engine = this.engine;
    const call = this.call;
    const remote = this.remoteVideo;
    if (!engine || !remote) return;
    const state: CallState['kind'] | PartyStatus = call?.state.kind ?? this.status;

    const stream = call?.remoteStream ?? null;
    if (remote.srcObject !== stream) {
      remote.srcObject = stream;
      if (stream) void remote.play().catch(() => {});
    }
    engine.audio.setVoice(stream);
    engine.audio.setTone(state === 'ringing' ? 'incoming' : state === 'calling' ? 'outgoing' : null);
    engine.audio.duckAmbience(state === 'calling' || state === 'ringing' || state === 'joining' || state === 'in-call');
    engine.screenAction = state === 'ringing' ? () => call?.answer() : call?.canCall ? () => call.call() : null;
    if (state === 'ringing' || state === 'calling') engine.screen.setVisible(true);

    const other = this.party?.members.find((m) => m.peerId !== this.peerId);
    const message =
      call?.state.kind === 'ended' ? { title: call.state.reason } : screenMessage(state, other?.name, call?.remoteMedia.video ?? true);
    if (message) engine.screen.showMessage(message.title, message.detail, { pulse: message.pulse });
    else engine.screen.showVideo(remote);
  }
}

function screenMessage(
  state: CallState['kind'] | PartyStatus,
  name: string | undefined,
  theirCamera: boolean,
): { title: string; detail?: string; pulse?: boolean } | null {
  switch (state) {
    case 'starting':
    case 'connecting':
      return { title: 'Joining…' };
    case 'waiting':
      return { title: 'Waiting for your friend', detail: 'Send them the invite link' };
    case 'ready':
      return { title: `${name ?? 'Your friend'} is here`, detail: 'Click the screen to call them' };
    case 'calling':
      return { title: `Calling ${name ?? 'your friend'}…`, pulse: true };
    case 'ringing':
      return { title: `${name ?? 'Your friend'} is calling`, detail: 'Click the screen to answer', pulse: true };
    case 'joining':
      return { title: 'Connecting…' };
    case 'in-call':
      return theirCamera ? null : { title: `${name ?? 'Their'} camera is off` };
    case 'full':
      return { title: 'This watch party is full' };
    case 'gone':
      return { title: 'The watch party has ended' };
    default:
      return null;
  }
}
