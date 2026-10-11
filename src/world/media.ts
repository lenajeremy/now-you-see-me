/** Your camera and microphone, or whichever of them could be opened. */
export interface LocalMedia {
  stream: MediaStream | null;
  /** Why something couldn't be opened, if it couldn't. */
  problem: string | null;
}

// Full HD if the camera can: the picture fills a big screen in the world.
const VIDEO: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
  facingMode: 'user',
};
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/**
 * Opens the camera and microphone. If both can't be had, falls back to just
 * one, so you can still take part in a call. Browsers only allow this on
 * https:// pages and localhost.
 */
export async function openLocalMedia(): Promise<LocalMedia> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, problem: 'The camera only works on secure pages (https or localhost).' };
  }
  let firstError: unknown = null;
  for (const constraints of [{ video: VIDEO, audio: AUDIO }, { video: VIDEO }, { audio: AUDIO }]) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const missing = [
        stream.getVideoTracks().length === 0 && 'camera',
        stream.getAudioTracks().length === 0 && 'microphone',
      ].filter(Boolean);
      return { stream, problem: missing.length ? `Couldn't open the ${missing.join(' or ')}.` : null };
    } catch (error) {
      firstError ??= error;
      // Once permission is refused, the other combinations will be refused too.
      if (error instanceof DOMException && error.name === 'NotAllowedError') break;
    }
  }
  return { stream: null, problem: describeMediaError(firstError) };
}

/** A short, human explanation of why the camera or microphone couldn't start. */
function describeMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'Camera and microphone were blocked. Allow them in the address bar, then reload.';
      case 'NotFoundError':
        return 'No camera or microphone was found.';
      case 'NotReadableError':
        return 'Another app is using the camera or microphone.';
    }
  }
  return error instanceof Error ? error.message : String(error);
}
