import type { ClientToServerEvents, ServerToClientEvents } from "@game-platform/shared";
import { io, type Socket } from "socket.io-client";

export type ArenaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ArenaSocket | null = null;
let socketToken: string | null = null;

/**
 * One socket per token. Connects to the page's own origin, so the Vite proxy
 * handles it in development and Fastify serves it directly once the API hosts
 * the built site.
 */
export function getSocket(token: string): ArenaSocket {
  if (socket && socketToken === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  closeSocket();
  socketToken = token;
  socket = io({
    auth: { token },
    transports: ["websocket", "polling"],
  });

  return socket;
}

export function peekSocket() {
  return socket;
}

export function closeSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
