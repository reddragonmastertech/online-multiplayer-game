import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@game-platform/shared";
import { checkToken, type AuthContext } from "./guard";
import { readBearerToken } from "./jwt";

export function attachSocketAuth(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  auth: AuthContext,
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

    // Same checks as HTTP: a suspended account or an ended session cannot
    // open a socket, so it cannot queue or play.
    try {
      const { payload } = checkToken(token, auth);
      socket.data.userId = payload.sub;
      socket.data.name = payload.name;
      auth.db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), payload.sub);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
}
