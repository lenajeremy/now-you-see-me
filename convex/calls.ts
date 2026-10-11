import { action } from './_generated/server';

/**
 * The servers browsers use to find a way to reach each other. STUN is enough
 * on most networks; a TURN relay is needed when both sides are behind strict
 * firewalls. Cloudflare's relay is used when CLOUDFLARE_TURN_KEY_ID and
 * CLOUDFLARE_TURN_API_TOKEN are set in Convex.
 */
export const iceServers = action({
  args: {},
  handler: async (): Promise<RTCIceServer[]> => {
    const stun: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !token) return stun;
    try {
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const { iceServers } = (await response.json()) as { iceServers: RTCIceServer[] };
      return [...stun, ...iceServers];
    } catch (error) {
      console.warn('TURN credentials failed; calls will use STUN only.', String(error));
      return stun;
    }
  },
});
