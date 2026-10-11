/** Addresses for videos Mux streams. */

/** The HLS playlist, highest quality first so 360° video starts sharp. */
export function streamUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8?rendition_order=desc`;
}

/** A still from the video: the whole 2:1 panorama. */
export function thumbnailUrl(playbackId: string, { time, width = 1280 }: { time?: number; width?: number } = {}): string {
  const params = new URLSearchParams({ width: String(width) });
  if (time !== undefined) params.set('time', time.toFixed(1));
  return `https://image.mux.com/${playbackId}/thumbnail.webp?${params}`;
}
