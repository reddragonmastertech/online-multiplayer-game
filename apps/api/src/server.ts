import cors from "@fastify/cors";
import { createGameRegistry } from "@game-platform/game-core";
import {
  apiPaths,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@game-platform/shared";
import Fastify from "fastify";
import { Server } from "socket.io";
import { attachSocketAuth } from "./auth/socket";
import { registerAuthRoutes } from "./auth/routes";
import type { AppConfig } from "./config";
import { createDatabase, resolveSqlitePath } from "./db/client";
import { registerGames } from "./games/register";
import { registerWebApp } from "./http/web";
import { registerMatchGateway } from "./match/gateway";
import { releaseUnsettledMatches } from "./match/store";

export async function buildServer(config: AppConfig) {
  const app = Fastify({
    logger: { level: config.logLevel },
    // Behind a tunnel or reverse proxy the socket address is the proxy, so
    // rate limiting and logs need the forwarded client address instead.
    trustProxy: config.trustProxy,
  });
  const registry = createGameRegistry();
  const db = createDatabase(config.databaseUrl);

  registerGames(registry);

  await app.register(cors, { origin: config.webOrigin });

  app.get("/health", async () => ({ status: "ok" }));
  await registerAuthRoutes(app, {
    db,
    jwtSecret: config.jwtSecret,
    signupRateLimit: config.signupRateLimit,
    loginRateLimit: config.loginRateLimit,
  });

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

  // Public: a visitor may browse matches in progress without an account. The
  // summary carries no hands, so there is nothing here to withhold.
  app.get(apiPaths.live, async () => ({ matches: runtime.list() }));

  // Registered last so it never shadows an API route; its not-found handler is
  // what turns client-side routes into the app shell.
  const web = await registerWebApp(app, config.webDist);

  app.addHook("onClose", async () => {
    runtime.stop();
    await io.close();

    // Matches in flight cannot survive this process, so give the stakes back
    // now rather than leaving RAC locked until something starts again.
    const stranded = releaseUnsettledMatches(db);
    if (stranded.matches > 0) {
      app.log.info(stranded, "released matches that were still running at shutdown");
    }

    db.close();
  });

  app.log.info(
    {
      games: registry.list().map((game) => game.id),
      sqlite: resolveSqlitePath(config.databaseUrl),
      web: web.served ? web.root : "not built; run the web dev server instead",
    },
    "game modules registered",
  );

  return { app, io, registry, db, queue, runtime, web };
}
