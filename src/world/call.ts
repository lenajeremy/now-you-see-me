import type { ConnectSignaling, Signal, SignalingTransport } from './signaling';
import {
  preferCodec,
  preferredVideoCodec,
  receivedVideo,
  tuneVideoSender,
  withStartBitrate,
  type ReceivedVideo,
} from './videoQuality';

export type CallState =
  /** Connecting to the connection server. */
  | { kind: 'connecting' }
  /** Alone in the room. */
  | { kind: 'waiting' }
  /** The other person is in the room; no call yet. */
  | { kind: 'ready' }
  /** We're ringing them. */
  | { kind: 'calling' }
  /** They're ringing us. */
  | { kind: 'ringing' }
  /** Picked up; video and audio are connecting. */
  | { kind: 'joining' }
  | { kind: 'in-call'; since: number }
  /** Shown for a moment before settling back to waiting or ready. */
  | { kind: 'ended'; reason: string }
  | { kind: 'full' };

export interface MediaFlags {
  audio: boolean;
  video: boolean;
}

/** Public STUN helps when the laptops aren't on the same network; on one Wi-Fi it isn't needed. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const ENDED_LINGER_MS = 3000;
const JOIN_TIMEOUT_MS = 20_000;

/**
 * A one-to-one call with whoever else is in the room. Whoever presses Call
 * rings the other; when they pick up, the caller sends a WebRTC offer and the
 * video and audio flow directly between the two browsers.
 */
export class CallSession {
  state: CallState = { kind: 'connecting' };
  remoteStream: MediaStream | null = null;
  remoteMedia: MediaFlags = { audio: true, video: true };
  localMedia: MediaFlags;
  /** Called after any change to the state, the remote stream or the media flags. */
  onChange: () => void = () => {};

  private readonly signaling: SignalingTransport;
  private peerPresent = false;
  private pc: RTCPeerConnection | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private signals = Promise.resolve();
  private ringNonce = 0;
  private endedTimer = 0;
  private joinTimer = 0;

  constructor(
    connect: ConnectSignaling,
    private readonly local: MediaStream | null,
    /** STUN and TURN servers; a public STUN server if not given. */
    private readonly iceServers: RTCIceServer[] = ICE_SERVERS,
  ) {
    this.localMedia = {
      audio: (local?.getAudioTracks().length ?? 0) > 0,
      video: (local?.getVideoTracks().length ?? 0) > 0,
    };
    this.signaling = connect({
      onJoined: (others) => {
        this.peerPresent = others > 0;
        if (!this.connected) this.settle();
      },
      onPeerJoined: () => {
        this.peerPresent = true;
        if (this.state.kind === 'waiting') this.setState({ kind: 'ready' });
      },
      onPeerLeft: () => {
        this.peerPresent = false;
        if (this.busy) this.end('They left');
        else this.settle();
      },
      onFull: () => this.setState({ kind: 'full' }),
      // Handle signals one at a time, so ICE candidates never overtake the offer they belong to.
      onSignal: (signal) => {
        this.signals = this.signals.then(() => this.handleSignal(signal)).catch((error) => {
          console.error('Call signalling failed', error);
          this.end("Couldn't connect");
        });
      },
      onDisconnected: () => {
        if (!this.connected) this.setState({ kind: 'connecting' });
      },
    });
  }

  /** Rings the other person. */
  call(): void {
    if (!this.peerPresent || (this.state.kind !== 'ready' && this.state.kind !== 'ended')) return;
    this.ringNonce = Math.random();
    this.signaling.send({ type: 'ring', nonce: this.ringNonce });
    this.setState({ kind: 'calling' });
  }

  answer(): void {
    if (this.state.kind !== 'ringing') return;
    this.signaling.send({ type: 'accept' });
    this.startJoining();
  }

  decline(): void {
    if (this.state.kind !== 'ringing') return;
    this.signaling.send({ type: 'decline' });
    this.settle();
  }

  /** Cancels an outgoing call, or ends the current one. */
  hangUp(): void {
    if (this.state.kind === 'calling') {
      this.signaling.send({ type: 'cancel' });
      this.settle();
    } else if (this.connected) {
      this.signaling.send({ type: 'hangup' });
      this.end('Call ended');
    }
  }

  setLocalMedia(flags: Partial<MediaFlags>): void {
    this.localMedia = { ...this.localMedia, ...flags };
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = this.localMedia.audio;
    for (const track of this.local?.getVideoTracks() ?? []) track.enabled = this.localMedia.video;
    this.sendMediaFlags();
    this.onChange();
  }

  /** The size and frame rate of the video arriving from the other person, while in a call. */
  async receivedVideo(): Promise<ReceivedVideo | null> {
    return this.pc && this.state.kind === 'in-call' ? receivedVideo(this.pc) : null;
  }

  /** Leaves the room, hanging up first if needed. */
  leave(): void {
    this.hangUp();
    this.signaling.close();
  }

  get canCall(): boolean {
    return this.peerPresent && (this.state.kind === 'ready' || this.state.kind === 'ended');
  }

  /** Video and audio are connected or connecting. */
  private get connected(): boolean {
    return this.state.kind === 'joining' || this.state.kind === 'in-call';
  }

  private get busy(): boolean {
    return this.connected || this.state.kind === 'calling' || this.state.kind === 'ringing';
  }

  private async handleSignal(signal: Signal): Promise<void> {
    switch (signal.type) {
      case 'ring':
        if (this.state.kind === 'calling') {
          // Both pressed Call at once: the higher number places the call, the other picks up.
          if (signal.nonce > this.ringNonce) {
            this.signaling.send({ type: 'accept' });
            this.startJoining();
          }
        } else if (!this.busy) {
          this.setState({ kind: 'ringing' });
        }
        return;

      case 'cancel':
        if (this.state.kind === 'ringing') this.end('Missed call');
        return;

      case 'accept':
        if (this.state.kind !== 'calling') return;
        this.startJoining();
        {
          const pc = this.createPeer(true);
          preferCodec(pc, await preferredVideoCodec());
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.signaling.send({ type: 'offer', sdp: offer.sdp! });
          await tuneVideoSender(pc);
        }
        return;

      case 'decline':
        if (this.state.kind === 'calling') this.end('Declined');
        return;

      case 'hangup':
        if (this.connected) this.end('They hung up');
        return;

      case 'offer': {
        if (this.state.kind !== 'joining') return;
        const pc = this.createPeer(false);
        await pc.setRemoteDescription({ type: 'offer', sdp: withStartBitrate(signal.sdp) });
        await this.flushIce();
        preferCodec(pc, await preferredVideoCodec());
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.send({ type: 'answer', sdp: answer.sdp! });
        await tuneVideoSender(pc);
        return;
      }

      case 'answer':
        if (!this.pc) return;
        await this.pc.setRemoteDescription({ type: 'answer', sdp: withStartBitrate(signal.sdp) });
        await this.flushIce();
        return;

      case 'ice':
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(signal.candidate);
        else this.pendingIce.push(signal.candidate);
        return;

      case 'media':
        this.remoteMedia = { audio: signal.audio, video: signal.video };
        this.onChange();
        return;
    }
  }

  private createPeer(offerer: boolean): RTCPeerConnection {
    this.closePeer();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;

    for (const track of this.local?.getTracks() ?? []) pc.addTrack(track, this.local!);
    // Make sure the offer asks for both kinds, even if we have no camera or mic to send.
    // (The answering side gets its slots from the offer.)
    for (const kind of offerer ? (['audio', 'video'] as const) : []) {
      if (!pc.getTransceivers().some((t) => t.receiver.track.kind === kind)) {
        pc.addTransceiver(kind, { direction: 'recvonly' });
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) this.signaling.send({ type: 'ice', candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      if (pc !== this.pc) return;
      let stream = event.streams[0];
      if (!stream) {
        stream = this.remoteStream ?? new MediaStream();
        stream.addTrack(event.track);
      }
      this.remoteStream = stream;
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected' && this.state.kind === 'joining') {
        clearTimeout(this.joinTimer);
        this.setState({ kind: 'in-call', since: Date.now() });
        this.sendMediaFlags();
      } else if (pc.connectionState === 'failed') {
        this.end('Connection lost');
      }
    };
    return pc;
  }

  private async flushIce(): Promise<void> {
    const pending = this.pendingIce;
    this.pendingIce = [];
    for (const candidate of pending) await this.pc?.addIceCandidate(candidate);
  }

  private startJoining(): void {
    this.setState({ kind: 'joining' });
    clearTimeout(this.joinTimer);
    this.joinTimer = window.setTimeout(() => {
      if (this.state.kind === 'joining') {
        this.signaling.send({ type: 'hangup' });
        this.end("Couldn't connect");
      }
    }, JOIN_TIMEOUT_MS);
  }

  private sendMediaFlags(): void {
    if (this.connected) this.signaling.send({ type: 'media', ...this.localMedia });
  }

  private end(reason: string): void {
    this.closePeer();
    this.setState({ kind: 'ended', reason });
    clearTimeout(this.endedTimer);
    this.endedTimer = window.setTimeout(() => {
      if (this.state.kind === 'ended') this.settle();
    }, ENDED_LINGER_MS);
  }

  private closePeer(): void {
    clearTimeout(this.joinTimer);
    this.pc?.close();
    this.pc = null;
    this.pendingIce = [];
    this.remoteStream = null;
    this.remoteMedia = { audio: true, video: true };
  }

  /** Back to the resting state for whoever's in the room. */
  private settle(): void {
    this.setState({ kind: this.peerPresent ? 'ready' : 'waiting' });
  }

  private setState(state: CallState): void {
    this.state = state;
    this.onChange();
  }
}
