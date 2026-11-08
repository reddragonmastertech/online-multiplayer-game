import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@game-platform/shared";
import { readBearerToken, verifyAccessToken } from "./jwt";

export function attachSocketAuth(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  jwtSecret: string,
) {
  io.use((socket, next) => {
    const handshakeToken = (socket.handshake.auth as { token?: unknown }).token;
    const token =
      typeof handshakeToken === "string"
        ? handshakeToken
        : readBearerToken(socket.handshake.headers.authorization);

    if (!token) {
      socket.data.userId = "";
      socket.data.name = "";
      next();
      return;
    }

    try {
      const payload = verifyAccessToken(token, jwtSecret);
      socket.data.userId = payload.sub;
      socket.data.name = payload.name;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
}
