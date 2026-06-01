import { io, Socket } from "socket.io-client";

export function createSocket(): Socket {
  return io(window.location.origin, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
