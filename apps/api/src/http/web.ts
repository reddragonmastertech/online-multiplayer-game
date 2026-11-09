import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { notFound, sendError } from "./errors";

/** Paths the single-page fallback must never swallow. */
const SERVER_PREFIXES = ["/api", "/socket.io", "/health"];

/**
 * Where `pnpm --filter @game-platform/web build` leaves the bundle, resolved
 * from this file rather than the working directory so it does not matter
 * whether the API was started from the repo root or from apps/api.
 */
export function resolveWebDist(webDist?: string) {
  if (webDist) {
    return isAbsolute(webDist) ? webDist : resolve(process.cwd(), webDist);
  }

  return fileURLToPath(new URL("../../../web/dist", import.meta.url));
}

export function isServerPath(url: string) {
  const path = url.split("?")[0] ?? "";
  return SERVER_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Serves the built site next to the API so testers need one URL. Returns false
 * when there is no bundle, which is the normal case in development where Vite
 * serves the site and proxies here.
 */
export async function registerWebApp(app: FastifyInstance, webDist?: string) {
  const root = resolveWebDist(webDist);

  if (!existsSync(resolve(root, "index.html"))) {
    return { served: false as const, root };
  }

  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    setHeaders: (response, path) => {
      // Asset filenames carry a content hash, so they can be cached hard.
      // index.html must not be, or a deploy would never reach a returning tab.
      response.header(
        "Cache-Control",
        path.endsWith("index.html")
          ? "no-cache"
          : "public, max-age=31536000, immutable",
      );
    },
  });

  // Client-side routes such as /games/rps or /room/:id are not files. Anything
  // that is not an API or socket path falls back to the app shell.
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET" || isServerPath(request.url)) {
      return sendError(reply, notFound());
    }

    return reply.sendFile("index.html");
  });

  return { served: true as const, root };
}
