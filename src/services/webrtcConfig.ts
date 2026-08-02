/**
 * The STUN/TURN set every call in this app uses.
 *
 * Pulled out of VideoCallManager when the client-facing order chat gained calling: two copies of a
 * TURN credential is one copy too many, and the day those credentials are rotated the second copy
 * is the one nobody remembers to change.
 */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "38b64099e7bb8c35280b6472",
      credential: "SqYYS9/l+2/dw0MP",
    },
  ],
};
