import cors from "@fastify/cors";
import { createGameRegistry } from "@game-platform/game-core";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@game-platform/shared";
import Fastify from "fastify";
import { Server } from "socket.io";
import { attachSocketAuth } from "./auth/socket";
import { registerAuthRoutes } from "./auth/routes";
import type { AppConfig } from "./config";
import { createDatabase, resolveSqlitePath } from "./db/client";
import { registerGames } from "./games/register";
import { registerMatchGateway } from "./match/gateway";
import { releaseUnsettledMatches } from "./match/store";

export async function buildServer(config: AppConfig) {
  const app = Fastify({ logger: true });
  const registry = createGameRegistry();
  const db = createDatabase(config.databaseUrl);

  registerGames(registry);

  await app.register(cors, { origin: config.webOrigin });

  app.get("/health", async () => ({ status: "ok" }));
  registerAuthRoutes(app, { db, jwtSecret: config.jwtSecret });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    app.server,
    {
      cors: { origin: config.webOrigin },
    },
  );

  attachSocketAuth(io, config.jwtSecret);

  const released = releaseUnsettledMatches(db);
  if (released.matches > 0) {
    app.log.warn(released, "cancelled matches left unsettled by a previous process");
  }

  const { queue, runtime } = registerMatchGateway(io, { db, log: app.log });

  app.addHook("onClose", async () => {
    runtime.stop();
    await io.close();
    db.close();
  });

  app.log.info(
    {
      games: registry.list().map((game) => game.id),
      sqlite: resolveSqlitePath(config.databaseUrl),
    },
    "game modules registered",
  );

  return { app, io, registry, db, queue, runtime };
}
