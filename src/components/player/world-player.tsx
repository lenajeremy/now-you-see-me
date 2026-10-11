'use client';

import './world-player.css';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import {
  CircleHelp,
  Columns2,
  Eye,
  Loader2,
  Maximize,
  Minimize,
  Monitor,
  MonitorOff,
  Pause,
  Play,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WorldEngine } from '@/world/engine';
import { STAGE_YAW } from '@/world/config';
import type { ViewMode } from '@/world/splitView';
import { cn } from '@/lib/utils';

export interface WorldPlayerProps {
  /** An HLS playlist (.m3u8) or a plain video file. */
  src: string;
  /** How far across the panorama (0–1) the part in front of the viewer is. */
  facing?: number;
  autoPlay?: boolean;
  /** Start again at the end (backdrops, previews); off for watching. */
  loop?: boolean;
  /** Show the button that hides and shows the in-world screen (used during calls). */
  screenToggle?: boolean;
  /** Called once the world and its video exist, e.g. to wire up watching together. */
  onReady?: (engine: WorldEngine, video: HTMLVideoElement) => void;
  className?: string;
  /** Overlays drawn above the world (self-view, call status…). */
  children?: ReactNode;
}

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof Eye }[] = [
  { mode: 'first', label: 'First person (3)', icon: Eye },
  { mode: 'split', label: 'Both views (2)', icon: Columns2 },
  { mode: 'outside', label: 'Outside view (1)', icon: Video },
];

/**
 * A 360° video you stand inside: drag to look around, switch to an outside view
 * of yourself, with the usual playback controls over it.
 */
export function WorldPlayer({ src, facing, autoPlay = true, loop = true, screenToggle, onReady, className, children }: WorldPlayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outsideRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ready = useEffectEvent((engine: WorldEngine, video: HTMLVideoElement) => onReady?.(engine, video));

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [mode, setMode] = useState<ViewMode>('first');
  const [screenShown, setScreenShown] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [heading, setHeading] = useState(0);
  const [idle, setIdle] = useState(false);
  const [looked, setLooked] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // The world and its video live for as long as the player shows this source.
  useEffect(() => {
    const root = rootRef.current!;
    const engine = new WorldEngine({
      root,
      canvas: canvasRef.current!,
      outsidePane: outsideRef.current!,
      firstPane: firstRef.current!,
      divider: dividerRef.current!,
    });
    engine.split.onModeChange = setMode;
    engine.screen.onVisibilityChange = setScreenShown;
    engineRef.current = engine;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous'; // the frames feed WebGL and Web Audio
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = loop;
    video.muted = true; // muted videos may autoplay; the sound is unmuted on the first click
    videoRef.current = video;

    let hls: Hls | null = null;
    if (src.includes('.m3u8') && Hls.isSupported()) {
      hls = new Hls({
        // Start from a high-bandwidth guess: a 360° view magnifies every pixel, so
        // starting at a low rendition looks badly blurry.
        abrEwmaDefaultEstimate: 20_000_000,
        capLevelToPlayerSize: false,
        maxBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }

    const events = new AbortController();
    const on = (type: string, listener: () => void) => video.addEventListener(type, listener, { signal: events.signal });
    on('play', () => setPlaying(true));
    on('pause', () => setPlaying(false));
    on('waiting', () => setWaiting(true));
    on('playing', () => setWaiting(false));
    on('canplay', () => setWaiting(false));
    on('timeupdate', () => setTime(video.currentTime));
    on('durationchange', () => setDuration(video.duration || 0));
    on('progress', () => {
      const ranges = video.buffered;
      setBuffered(ranges.length ? ranges.end(ranges.length - 1) : 0);
    });

    engine.showVideo(video, { facing });
    void engine.audio.setAmbience({ element: video });
    if (autoPlay) void video.play().catch(() => setPlaying(false));
    ready(engine, video);

    // Heading for the compass, and whether sound is still waiting for a click.
    const poll = window.setInterval(() => {
      setHeading(engine.look.yaw - STAGE_YAW);
      setSoundBlocked(engine.audio.blocked);
    }, 100);

    return () => {
      window.clearInterval(poll);
      events.abort();
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
      engine.dispose();
      engineRef.current = null;
      videoRef.current = null;
    };
  }, [src, facing, autoPlay, loop]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  }, []);

  const applyVolume = useCallback((next: number, nextMuted: boolean) => {
    setVolume(next);
    setMuted(nextMuted);
    engineRef.current?.audio.setAmbienceVolume(nextMuted ? 0 : next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // YouTube-style keys: space/K play, J/L ten seconds back/forward, M mute, F fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (key === 'j') seekBy(-10);
      else if (key === 'l') seekBy(10);
      else if (key === 'm') applyVolume(volume || 1, !muted);
      else if (key === 'f') toggleFullscreen();
      else if (e.key === '?') setHelpOpen((open) => !open);
      else if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, applyVolume, toggleFullscreen, volume, muted]);

  // The controls fade away while the video plays and the pointer rests.
  const idleTimer = useRef(0);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const controlsHidden = idle && playing;

  return (
    <div
      ref={rootRef}
      className={cn('world-player', controlsHidden && 'controls-hidden', className)}
      data-mode="first"
      onPointerMove={wake}
      onPointerDown={() => {
        wake();
        setLooked(true);
      }}
    >
      <canvas ref={canvasRef} className="world-player__canvas" />

      <div ref={outsideRef} className="world-player__pane" data-pane="outside">
        <span className="world-player__label">Outside</span>
      </div>
      <div ref={firstRef} className="world-player__pane" data-pane="first">
        <span className="world-player__label">First person</span>
      </div>
      <div ref={dividerRef} className="world-player__divider" title="Drag to resize · double-click to reset">
        <div className="grip" />
      </div>

      {waiting && (
        <div className="world-player__center" aria-live="polite">
          <Loader2 className="size-9 animate-spin text-white/80" aria-label="Loading" />
        </div>
      )}

      {!looked && !waiting && (
        <div className="world-player__hint" aria-hidden="true">
          Drag to look around
        </div>
      )}

      {soundBlocked && !muted && (
        <button
          type="button"
          className="world-player__unmute"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => applyVolume(volume || 1, false)}
        >
          <VolumeX className="size-4" /> Click for sound
        </button>
      )}

      {children}

      {helpOpen && <PlayerHelp onClose={() => setHelpOpen(false)} screenToggle={!!screenToggle} />}

      <div className="world-player__controls" onPointerDown={(e) => e.stopPropagation()}>
        <Scrubber time={time} duration={duration} buffered={buffered} onSeek={(t) => videoRef.current && (videoRef.current.currentTime = t)} />
        <div className="flex items-center gap-1">
          <ControlButton label={playing ? 'Pause (k)' : 'Play (k)'} onClick={togglePlay}>
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </ControlButton>

          <div className="group/volume flex items-center">
            <ControlButton label={muted || volume === 0 ? 'Unmute (m)' : 'Mute (m)'} onClick={() => applyVolume(volume || 1, !muted)}>
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => applyVolume(Number(e.target.value), false)}
              aria-label="Volume"
              className="world-player__volume"
            />
          </div>

          <span className="ml-2 font-mono text-xs whitespace-nowrap tabular-nums text-white/85">
            {formatTime(time)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <span className="world-player__wide-only">
              <ControlButton label="Face the front" onClick={() => engineRef.current?.look.lookAt(STAGE_YAW, 0)}>
                <Compass heading={heading} />
              </ControlButton>
            </span>

            <div className="mx-1 flex rounded-full bg-white/10 p-0.5" role="group" aria-label="View">
              {VIEW_MODES.map(({ mode: value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={mode === value}
                  onClick={() => engineRef.current?.split.setMode(value)}
                  className={cn(
                    'grid size-8 place-items-center rounded-full text-white/75 transition-colors hover:text-white',
                    mode === value && 'bg-white text-neutral-900 hover:text-neutral-900',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>

            {screenToggle && (
              <ControlButton
                label={screenShown ? 'Hide the screen (s)' : 'Show the screen (s)'}
                onClick={() => engineRef.current?.screen.setVisible(!screenShown)}
              >
                {screenShown ? <Monitor className="size-5" /> : <MonitorOff className="size-5" />}
              </ControlButton>
            )}

            <ControlButton label="How to use the player (?)" onClick={() => setHelpOpen(!helpOpen)}>
              <CircleHelp className="size-5" />
            </ControlButton>

            <ControlButton label={fullscreen ? 'Exit full screen (f)' : 'Full screen (f)'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

const HELP: [string, string][] = [
  ['Drag', 'Look around (swipe on a phone)'],
  ['Compass', 'Face the front again'],
  ['1  2  3', 'Outside, both, or first-person view'],
  ['Space / K', 'Play or pause'],
  ['J / L', 'Back or forward 10 seconds'],
  ['M', 'Mute'],
  ['F', 'Full screen'],
];

/** How the player works, over the video. */
function PlayerHelp({ onClose, screenToggle }: { onClose: () => void; screenToggle: boolean }) {
  const rows = screenToggle ? [...HELP, ['S', 'Show or hide the screen in the world'] as [string, string]] : HELP;
  return (
    <div
      className="absolute right-3 bottom-16 z-20 w-72 rounded-2xl bg-black/75 p-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="How to use the player"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">You’re inside the video</p>
        <button type="button" onClick={onClose} className="text-xs text-white/60 hover:text-white">
          Close
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
        {rows.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">{keys}</kbd>
            </dt>
            <dd className="text-white/80">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
    >
      {children}
    </button>
  );
}

/** Where you're facing, relative to the front of the video. */
function Compass({ heading }: { heading: number }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
      <g transform={`rotate(${(-heading * 180) / Math.PI} 12 12)`}>
        <path d="M12 4.5 L15 12 L12 10.8 L9 12 Z" fill="var(--color-primary)" />
      </g>
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function Scrubber({
  time,
  duration,
  buffered,
  onSeek,
}: {
  time: number;
  duration: number;
  buffered: number;
  onSeek: (time: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const fraction = (t: number) => (duration ? Math.min(1, t / duration) : 0);
  const timeAt = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };

  return (
    <div
      ref={barRef}
      className="world-player__scrubber"
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onSeek(timeAt(e.clientX));
      }}
      onPointerMove={(e) => {
        setHover(timeAt(e.clientX));
        if (e.buttons) onSeek(timeAt(e.clientX));
      }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + 5));
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - 5));
      }}
    >
      <div className="track">
        <div className="buffered" style={{ width: `${fraction(buffered) * 100}%` }} />
        <div className="played" style={{ width: `${fraction(time) * 100}%` }} />
        <div className="thumb" style={{ left: `${fraction(time) * 100}%` }} />
      </div>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${fraction(hover) * 100}%` }}>
          {formatTime(hover)}
        </div>
      )}
    </div>
  );
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
