import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clientEvent,
  serverEvent,
  type ChatMessage,
  type ClientToServerEvents,
  type ProtocolError,
  type ServerToClientEvents,
} from "@game-platform/shared";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt";
import { buildServer } from "../server";
import { createQueuedMatch } from "./store";

/**
 * Real sockets against a real server, for the rules that only the gateway can
 * enforce: who may chat, and who receives it.
 */

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const SECRET = "gateway-test-secret";
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "arena-gateway-"));
  const server = await buildServer({
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    webOrigin: "http://localhost:5173",
    databaseUrl: `file:${join(dir, "test.db")}`,
    jwtSecret: SECRET,
    logLevel: "fatal",
    trustProxy: false,
    signupRateLimit: 100,
    loginRateLimit: 100,
    webDist: join(dir, "no-such-dist"),
  });
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  const address = server.app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => server.app.close());
  return { ...server, url: `http://127.0.0.1:${port}` };
}

function seatTwoPlayers(server: Awaited<ReturnType<typeof startServer>>) {
  for (const id of ["ann", "ben"]) {
    server.db
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, 'x', '2026-01-01T00:00:00.000Z')",
      )
      .run(id, `Player ${id}`, `${id}@example.test`);
  }
  const players = {
    a: { userId: "ann", name: "Player ann" },
    b: { userId: "ben", name: "Player ben" },
  };
  const params = {
    gameId: "rps" as const,
    mode: "first-to-2" as const,
    currency: "rac" as const,
    stake: 1,
  };
  const { matchId } = createQueuedMatch(server.db, {
    ...params,
    players: [
      { seat: "a", ...players.a },
      { seat: "b", ...players.b },
    ],
  });
  server.runtime.start({ matchId, ...params, players });
  return matchId;
}

async function client(url: string, userId?: string): Promise<Client> {
  const token = userId
    ? signAccessToken({ sub: userId, name: `Player ${userId}`, email: `${userId}@example.test` }, SECRET)
    : undefined;
  const socket: Client = connect(url, { auth: token ? { token } : {}, transports: ["websocket"] });
  cleanups.push(() => {
    socket.disconnect();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

function collect<T>(socket: Client, event: string) {
  const seen: T[] = [];
  socket.on(event as never, ((payload: T) => seen.push(payload)) as never);
  return seen;
}

function nextEvent<T>(socket: Client, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event as never, resolve as never));
}

/** Lets in-flight socket traffic land before asserting that nothing arrived. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("match chat over real sockets", () => {
  it("delivers to both players and never to a spectator", async () => {
    const server = await startServer();
    const matchId = seatTwoPlayers(server);

    const ann = await client(server.url, "ann");
    const ben = await client(server.url, "ben");
    const guest = await client(server.url);

    // The guest really is watching: it shares the match room for reveals.
    const watching = nextEvent(guest, serverEvent.matchState);
    guest.emit(clientEvent.matchWatch, { matchId });
    await watching;

    const guestChat = collect<ChatMessage>(guest, serverEvent.chatMessage);
    const toBen = nextEvent<ChatMessage>(ben, serverEvent.chatMessage);
    const toAnn = nextEvent<ChatMessage>(ann, serverEvent.chatMessage);

    ann.emit(clientEvent.chatSend, { matchId, text: "good luck" });

    expect(await toBen).toMatchObject({ matchId, seat: "a", name: "Player ann", text: "good luck" });
    expect((await toAnn).text).toBe("good luck");
    await settle();
    expect(guestChat).toEqual([]);
  });

  it("refuses a spectator who sends anyway", async () => {
    const server = await startServer();
    const matchId = seatTwoPlayers(server);

    const ann = await client(server.url, "ann");
    const outsider = await client(server.url, "carl");
    const annChat = collect<ChatMessage>(ann, serverEvent.chatMessage);

    const refused = nextEvent<ProtocolError>(outsider, serverEvent.error);
    outsider.emit(clientEvent.chatSend, { matchId, text: "let me in" });

    expect((await refused).code).toBe("not_your_match");
    await settle();
    expect(annChat).toEqual([]);
  });

  it("sends the history to a player who reconnects", async () => {
    const server = await startServer();
    const matchId = seatTwoPlayers(server);

    const ann = await client(server.url, "ann");
    const ben = await client(server.url, "ben");
    const delivered = nextEvent<ChatMessage>(ben, serverEvent.chatMessage);
    ann.emit(clientEvent.chatSend, { matchId, text: "remember me" });
    await delivered;

    ben.disconnect();
    const again: Client = connect(server.url, {
      auth: {
        token: signAccessToken({ sub: "ben", name: "Player ben", email: "ben@example.test" }, SECRET),
      },
      transports: ["websocket"],
    });
    cleanups.push(() => {
      again.disconnect();
    });

    const history = await nextEvent<{ matchId: string; messages: ChatMessage[] }>(
      again,
      serverEvent.chatHistory,
    );
    expect(history.matchId).toBe(matchId);
    expect(history.messages.map((message) => message.text)).toEqual(["remember me"]);
  });
});
