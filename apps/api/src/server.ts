import cors from "@fastify/cors";
import { createGameRegistry } from "@game-platform/game-core";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@game-platform/shared";
import Fastify from "fastify";
import { Server } from "socket.io";
import type { AppConfig } from "./config";
import { registerGames } from "./games/register";

export async function buildServer(config: AppConfig) {
  const app = Fastify({ logger: true });
  const registry = createGameRegistry();

  registerGames(registry);

  await app.register(cors, { origin: config.webOrigin });

  app.get("/health", async () => ({ status: "ok" }));

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    app.server,
    {
      cors: { origin: config.webOrigin },
    },
  );

  app.addHook("onClose", async () => {
    await io.close();
  });

  app.log.info(
    { games: registry.list().map((game) => game.id) },
    "game modules registered",
  );

  return { app, io, registry };
}
