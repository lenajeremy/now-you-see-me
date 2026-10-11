import * as THREE from 'three';
import { SCREEN } from './config';

export type Tone = 'incoming' | 'outgoing';

/** How loud the screen still sounds when you face directly away from it. */
const FACING_AWAY_VOLUME = 0.55;
/** The backdrop's ambient sound drops to this share of its volume during a call. */
const DUCKED_AMBIENCE = 0.3;

/** Where a backdrop's sound comes from: a file to loop, or a playing video's own soundtrack. */
export type AmbienceSource = { url: string } | { element: HTMLMediaElement };

/** A backdrop's ambient sound, playing. */
interface Ambience {
  from: string | HTMLMediaElement;
  gain: GainNode;
  stop(): void;
}

/**
 * Sound in the world. The listener sits at the person's ears; the ringtones
 * and the caller's voice come out of the screen. Turning your head moves the
 * sound left and right, and facing away from the screen softens it.
 */
export class WorldAudio {
  private readonly listener = new THREE.AudioListener();
  private readonly voice: THREE.PositionalAudio;
  private readonly bell: THREE.PositionalAudio;
  private readonly bellInput: GainNode;
  private readonly analyser: AnalyserNode;
  private voiceStream: MediaStream | null = null;
  private tone: Tone | null = null;
  private toneGain: GainNode | null = null;
  private toneTimer = 0;
  private readonly ambienceBus: GainNode;
  private ambience: Ambience | null = null;
  private ambienceVolume = 1;
  private ducked = false;
  private readonly listeners = new AbortController();
  private readonly sourcePosition = new THREE.Vector3();
  private readonly earPosition = new THREE.Vector3();
  private readonly gaze = new THREE.Vector3();

  /**
   * @param ears The first-person camera.
   * @param source Where the sound comes from: the middle of the screen.
   */
  constructor(
    private readonly ears: THREE.Camera,
    private readonly source: THREE.Object3D,
  ) {
    ears.add(this.listener);
    const context = this.listener.context;

    this.voice = new THREE.PositionalAudio(this.listener);
    this.bell = new THREE.PositionalAudio(this.listener);
    for (const sound of [this.voice, this.bell]) {
      // Full volume at the person's spot, 4.5 m away.
      sound.setRefDistance(SCREEN.distance);
      sound.setDistanceModel('inverse');
      source.add(sound);
    }
    this.bellInput = context.createGain();
    this.bell.setNodeSource(this.bellInput);

    // Measures the voice after placement, for checking that sound arrives.
    this.analyser = context.createAnalyser();
    this.voice.getOutput().connect(this.analyser);

    // The backdrop's sound is all around rather than from one spot, so it skips placement.
    this.ambienceBus = context.createGain();
    this.ambienceBus.gain.value = this.ambienceVolume;
    this.ambienceBus.connect(this.listener.getInput());

    // Browsers keep sound off until the person clicks or types on the page.
    const unlock = () =>
      void context.resume().then(() => {
        // A video's soundtrack can only be unmuted once the page has been interacted with.
        if (this.ambience?.from instanceof HTMLMediaElement) this.ambience.from.muted = false;
      });
    const signal = this.listeners.signal;
    window.addEventListener('pointerdown', unlock, { capture: true, signal });
    window.addEventListener('keydown', unlock, { capture: true, signal });
  }

  /** Stops every sound and detaches from the scene. The shared AudioContext stays open. */
  dispose(): void {
    this.listeners.abort();
    this.setTone(null);
    this.ambience?.stop();
    this.ambience = null;
    if (this.voiceStream) this.voice.disconnect();
    this.voiceStream = null;
    this.ambienceBus.disconnect();
    this.source.remove(this.voice, this.bell);
    this.ears.remove(this.listener);
  }

  /** Plays a remote stream's audio from the screen; null stops it. */
  setVoice(stream: MediaStream | null): void {
    // The stream may get its audio track a moment after its video track.
    const usable = stream && stream.getAudioTracks().length > 0 ? stream : null;
    if (usable === this.voiceStream) return;
    if (this.voiceStream) this.voice.disconnect();
    this.voiceStream = usable;
    if (usable) this.voice.setMediaStreamSource(usable);
  }

  /** Starts a repeating ringtone from the screen; null stops it. */
  setTone(tone: Tone | null): void {
    if (tone === this.tone) return;
    this.tone = tone;
    const context = this.listener.context;

    clearInterval(this.toneTimer);
    if (this.toneGain) {
      const fading = this.toneGain;
      fading.gain.setTargetAtTime(0, context.currentTime, 0.03);
      setTimeout(() => fading.disconnect(), 400);
      this.toneGain = null;
    }
    if (!tone) return;

    const gain = context.createGain();
    gain.connect(this.bellInput);
    this.toneGain = gain;
    const pattern = TONES[tone];
    let next = context.currentTime + 0.05;
    const scheduleAhead = () => {
      while (next < context.currentTime + pattern.period) {
        pattern.play(context, gain, next);
        next += pattern.period;
      }
    };
    scheduleAhead();
    this.toneTimer = window.setInterval(scheduleAhead, 500);
  }

  /**
   * Plays a backdrop's ambient sound, cross-fading from the previous one; null
   * fades it out. A file is decoded whole so its loop has no gap; a video's
   * soundtrack is taken from the element itself, so it stays in sync.
   */
  async setAmbience(source: AmbienceSource | null): Promise<void> {
    const from = source && ('url' in source ? source.url : source.element);
    if (from === (this.ambience?.from ?? null)) return;
    const context = this.listener.context;
    const previous = this.ambience;
    if (previous) {
      previous.gain.gain.setTargetAtTime(0, context.currentTime, 0.4);
      setTimeout(() => previous.stop(), 2500);
    }
    this.ambience = null;
    if (!from) return;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.ambienceBus);
    const fadeIn = () => gain.gain.setTargetAtTime(1, context.currentTime, 0.8);

    if (from instanceof HTMLMediaElement) {
      // The element's sound now flows through the graph (volume, ducking) instead of straight out.
      const node = context.createMediaElementSource(from);
      node.connect(gain);
      this.ambience = { from, gain, stop: () => (node.disconnect(), gain.disconnect()) };
      if (context.state === 'running') from.muted = false;
      fadeIn();
      return;
    }

    const ambience: Ambience = { from, gain, stop: () => gain.disconnect() };
    this.ambience = ambience;
    const buffer = await fetch(from)
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data));
    if (this.ambience !== ambience) {
      gain.disconnect();
      return;
    }
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.connect(gain);
    node.start();
    ambience.stop = () => (node.stop(), gain.disconnect());
    fadeIn();
  }

  /** The backdrop sound's volume, 0–1. */
  setAmbienceVolume(volume: number): void {
    this.ambienceVolume = volume;
    this.applyAmbienceLevel();
  }

  /** Lowers the backdrop's sound while a call is ringing or under way. */
  duckAmbience(ducked: boolean): void {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.applyAmbienceLevel();
  }

  private applyAmbienceLevel(): void {
    const level = this.ambienceVolume * (this.ducked ? DUCKED_AMBIENCE : 1);
    this.ambienceBus.gain.setTargetAtTime(level, this.listener.context.currentTime, 0.3);
  }

  /** How loud the caller's voice is right now (RMS, 0–1), as heard at the ears. */
  voiceLevel(): number {
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
  }

  get blocked(): boolean {
    return this.listener.context.state !== 'running';
  }

  update(): void {
    this.source.getWorldPosition(this.sourcePosition);
    this.ears.getWorldPosition(this.earPosition);
    this.ears.getWorldDirection(this.gaze);
    const facing = this.gaze.dot(this.sourcePosition.sub(this.earPosition).normalize()); // 1 = facing it
    const volume = FACING_AWAY_VOLUME + (1 - FACING_AWAY_VOLUME) * ((facing + 1) / 2);
    this.voice.setVolume(volume);
    this.bell.setVolume(volume);
  }
}

interface TonePattern {
  /** Seconds between repeats. */
  period: number;
  play(context: AudioContext, output: AudioNode, at: number): void;
}

const TONES: Record<Tone, TonePattern> = {
  // Incoming: two quick rising chimes, like a friendly phone.
  incoming: {
    period: 2.6,
    play(context, output, at) {
      const notes = [659.25, 830.61, 987.77, 1318.51]; // E5 G#5 B5 E6
      for (const offset of [0, 0.6]) {
        notes.forEach((frequency, i) => chime(context, output, at + offset + i * 0.1, frequency));
      }
    },
  },
  // Outgoing: the soft double ring you hear while it rings at the other end.
  outgoing: {
    period: 3,
    play(context, output, at) {
      for (const offset of [0, 0.6]) {
        for (const frequency of [400, 450]) hold(context, output, at + offset, frequency, 0.4);
      }
    },
  },
};

/** A short marimba-like note: a sine plus a quieter octave, decaying fast. */
function chime(context: AudioContext, output: AudioNode, at: number, frequency: number): void {
  for (const [multiple, peak] of [
    [1, 0.16],
    [2, 0.04],
  ]) {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency * multiple;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    oscillator.connect(envelope).connect(output);
    oscillator.start(at);
    oscillator.stop(at + 0.75);
  }
}

/** A steady tone with soft edges. */
function hold(context: AudioContext, output: AudioNode, at: number, frequency: number, duration: number): void {
  const oscillator = context.createOscillator();
  oscillator.frequency.value = frequency;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(0.05, at + 0.02);
  envelope.gain.setValueAtTime(0.05, at + duration - 0.02);
  envelope.gain.linearRampToValueAtTime(0, at + duration);
  oscillator.connect(envelope).connect(output);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}
