/** Messages the two browsers send each other through the connection server. */
export type Signal =
  | { type: 'ring'; nonce: number }
  | { type: 'cancel' }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'hangup' }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'media'; audio: boolean; video: boolean };

export interface SignalingHandlers {
  /** Joined the room; `others` is how many people were already there. */
  onJoined(others: number): void;
  onPeerJoined(): void;
  onPeerLeft(): void;
  onFull(): void;
  onSignal(signal: Signal): void;
  /** Lost the connection to the server. It reconnects and rejoins by itself. */
  onDisconnected(): void;
}

/**
 * Carries signals between the two people in a call. Opened with the handlers
 * that receive what the other side sends; the transport behind it can be
 * anything (Convex, in the platform).
 */
export interface SignalingTransport {
  send(signal: Signal): void;
  close(): void;
}

export type ConnectSignaling = (handlers: SignalingHandlers) => SignalingTransport;
