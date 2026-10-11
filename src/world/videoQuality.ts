/**
 * Settings that keep the call's video sharp. Left to its defaults, WebRTC starts
 * at ~300 kbps and shrinks the picture to fit, taking many seconds to climb back
 * to full resolution, and it caps the bitrate well below what a home network can carry.
 */

/** The most the video may use. Plenty for 1080p, and fine on a home network. */
const MAX_BITRATE = 8_000_000;
/** Where the bitrate starts, instead of ramping up from a few hundred kbps. */
const START_BITRATE_KBPS = 3000;

let preferredCodec: Promise<string | null> | null = null;

/**
 * H.264 if this computer can encode it in hardware, else null to keep the
 * browser's default. Hardware encoding keeps 1080p from taxing the CPU, which
 * would otherwise make WebRTC lower the resolution. Every Mac has it (Apple's
 * VideoToolbox), even when the browser's "power efficient" answer says otherwise.
 */
export function preferredVideoCodec(): Promise<string | null> {
  preferredCodec ??= navigator.mediaCapabilities
    .encodingInfo({
      type: 'webrtc',
      video: { contentType: 'video/H264', width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 },
    })
    .then((info) => {
      const mac = /Macintosh|Mac OS X/.test(navigator.userAgent);
      return info.supported && (info.powerEfficient || mac) ? 'video/H264' : null;
    })
    .catch(() => null);
  return preferredCodec;
}

/** Puts `mimeType` first in the video codec list. Call before creating the offer or answer. */
export function preferCodec(pc: RTCPeerConnection, mimeType: string | null): void {
  const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs;
  if (!mimeType || !codecs) return;
  const isPreferred = (codec: RTCRtpCodec) => codec.mimeType.toLowerCase() === mimeType.toLowerCase();
  const ordered = [...codecs.filter(isPreferred), ...codecs.filter((codec) => !isPreferred(codec))];
  for (const transceiver of pc.getTransceivers()) {
    if (transceiver.receiver.track.kind === 'video') transceiver.setCodecPreferences(ordered);
  }
}

/**
 * Raises the bitrate cap. Resolution is otherwise left to WebRTC's "balanced"
 * default: with a good start bitrate it sends full resolution, and only lowers
 * it if the network or the computer really can't keep up (rather than turning
 * the call into a slideshow).
 */
export async function tuneVideoSender(pc: RTCPeerConnection): Promise<void> {
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  Object.assign(params.encodings[0], { maxBitrate: MAX_BITRATE, maxFramerate: 30, scaleResolutionDownBy: 1 });
  await sender.setParameters(params).catch((error) => console.warn('Could not tune video sender', error));
}

export interface ReceivedVideo {
  width: number;
  height: number;
  fps: number;
}

/** The size and frame rate of the video arriving from the other side. */
export async function receivedVideo(pc: RTCPeerConnection): Promise<ReceivedVideo | null> {
  let video: ReceivedVideo | null = null;
  (await pc.getStats()).forEach((s) => {
    if (s.type === 'inbound-rtp' && s.kind === 'video' && s.frameWidth) {
      video = { width: s.frameWidth, height: s.frameHeight, fps: Math.round(s.framesPerSecond ?? 0) };
    }
  });
  return video;
}

/**
 * Adds a start bitrate to the video codecs in an SDP from the other side, so
 * our sender begins at a high bitrate. (Chrome reads this from the remote description.)
 */
export function withStartBitrate(sdp: string): string {
  const lines = sdp.split('\r\n');
  const videoCodecs = new Set<string>();
  let inVideo = false;
  for (const line of lines) {
    if (line.startsWith('m=')) inVideo = line.startsWith('m=video');
    const rtpmap = inVideo && /^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i.exec(line);
    if (rtpmap) videoCodecs.add(rtpmap[1]);
  }
  const param = `x-google-start-bitrate=${START_BITRATE_KBPS}`;
  const withFmtp = new Set(lines.map((line) => /^a=fmtp:(\d+) /.exec(line)?.[1]));
  return lines
    .flatMap((line) => {
      const fmtp = /^a=fmtp:(\d+) /.exec(line);
      if (fmtp && videoCodecs.has(fmtp[1])) return [`${line};${param}`];
      const rtpmap = /^a=rtpmap:(\d+) /.exec(line);
      if (rtpmap && videoCodecs.has(rtpmap[1]) && !withFmtp.has(rtpmap[1])) return [line, `a=fmtp:${rtpmap[1]} ${param}`];
      return [line];
    })
    .join('\r\n');
}
