import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SITE_SETTINGS, clientEvent, serverEvent, type ProtocolError } from "@game-platform/shared";
import { io as connect } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt";
import { adjustBalance, lockStake, openWallets, readWallet } from "../economy/wallet";
import { createQueuedMatch } from "../match/store";
import { buildServer } from "../server";

/** Roadmap 4.2 part D3 over HTTP and sockets: switches, the live view and voiding. */

const SECRET = "control-secret";
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "arena-control-"));
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
    deposits: {
      addresses: { trc20: "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV" },
      chain: { ethRpcUrl: "http://x", bscRpcUrl: "http://x", trongridUrl: "http://x" },
    },
  });
  await server.app.listen({ host: "127.0.0.1", port: 0 });
  const address = server.app.server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => server.app.close());

  for (const [id, role] of [
    ["ann", null],
    ["ben", null],
    ["boss", "owner"],
    ["sue", "support"],
  ] as const) {
    server.db
      .prepare("INSERT INTO users (id, name, email, password_hash, created_at, role, totp_enabled) VALUES (?, ?, ?, 'x', 'now', ?, ?)")
      .run(id, id, `${id}@example.test`, role, role ? 1 : 0);
    openWallets(server.db, id, "2026-01-01T00:00:00.000Z");
  }
  const token = (id: string, scope?: "admin") =>
    signAccessToken({ sub: id, name: id, email: `${id}@example.test`, ...(scope ? { scope } : {}) }, SECRET, 3600);
  const as = (id: string) => ({ authorization: `Bearer ${token(id)}` });
  const admin = (id: string) => ({ authorization: `Bearer ${token(id, "admin")}` });
  return { ...server, url, as, admin, token };
}

async function queueRefusal(url: string, token: string, entry: Record<string, unknown>) {
  const socket = connect(url, { auth: { token }, transports: ["websocket"] });
  cleanups.push(() => socket.disconnect());
  await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
  const refused = new Promise<ProtocolError>((resolve) => socket.once(serverEvent.error, resolve));
  socket.emit(clientEvent.queueJoin, entry as never);
  return refused;
}

describe("site switches", () => {
  it("are public to read, owner-or-finance to change, and enforced at once", async () => {
    const { app, url, as, admin, token, db } = await start();

    expect((await app.inject({ method: "GET", url: "/api/site" })).json()).toEqual(DEFAULT_SITE_SETTINGS);

    const supportTry = await app.inject({
      method: "POST",
      url: "/api/admin/site",
      headers: admin("sue"),
      payload: { ...DEFAULT_SITE_SETTINGS, maintenance: true },
    });
    expect(supportTry.statusCode).toBe(403);

    const paused = {
      ...DEFAULT_SITE_SETTINGS,
      maintenance: true,
      deposits: { ...DEFAULT_SITE_SETTINGS.deposits, trc20: false },
      withdrawals: { ...DEFAULT_SITE_SETTINGS.withdrawals, trc20: false },
      announcement: { text: "Maintenance at 22:00 UTC", level: "warning" as const },
    };
    const saved = await app.inject({ method: "POST", url: "/api/admin/site", headers: admin("boss"), payload: paused });
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/site" })).json()).toEqual(paused);

    // Maintenance: no new matches.
    const rac = { gameId: "rps", mode: "first-to-2", currency: "rac", stake: 1 };
    expect((await queueRefusal(url, token("ann"), rac)).message).toContain("maintenance");

    // USDT rooms paused, maintenance off: USDT joins are refused.
    await app.inject({
      method: "POST",
      url: "/api/admin/site",
      headers: admin("boss"),
      payload: { ...paused, maintenance: false, usdtRooms: false },
    });
    adjustBalance(db, { userId: "ann", currency: "usdt", amount: 20_000_000 });
    expect((await queueRefusal(url, token("ann"), { ...rac, currency: "usdt", stake: 1_000_000 })).message).toContain(
      "USDT rooms are paused",
    );

    // Deposits and withdrawals paused on TRC20.
    db.prepare(
      "INSERT INTO deposit_wallets (user_id, network, address, created_at) VALUES ('ann', 'trc20', 'TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E', 'now')",
    ).run();
    const claim = await app.inject({
      method: "POST",
      url: "/api/deposits/claim",
      headers: as("ann"),
      payload: { network: "trc20", txId: "ab".repeat(32) },
    });
    expect(claim.json().error.message).toBe("TRC20 deposits are paused right now. Try again later.");
    const overview = (await app.inject({ method: "GET", url: "/api/deposits", headers: as("ann") })).json();
    expect(overview.networks.find((n: { network: string }) => n.network === "trc20").address).toBeNull();
    const withdraw = await app.inject({
      method: "POST",
      url: "/api/withdrawals",
      headers: as("ann"),
      payload: { network: "trc20", amount: 10_000_000 },
    });
    expect(withdraw.json().error.message).toBe("TRC20 withdrawals are paused right now. Try again later.");

    // Every change is audited with exactly what changed.
    const audit = db
      .prepare("SELECT details FROM admin_audit WHERE action = 'site.settings_changed' ORDER BY rowid")
      .all() as { details: string }[];
    expect(audit).toHaveLength(2);
    expect(JSON.parse(audit[1]!.details)).toEqual({ maintenance: { from: true, to: false }, usdtRooms: { from: true, to: false } });
  });
});

describe("live matches and voiding", () => {
  it("lists a live match with names, voids it with a reason, and refunds both players", async () => {
    const { app, admin, db, runtime } = await start();
    for (const id of ["ann", "ben"]) lockStake(db, { userId: id, currency: "rac", stake: 5 });
    const params = { gameId: "rps" as const, mode: "first-to-2" as const, currency: "rac" as const, stake: 5 };
    const players = { a: { userId: "ann", name: "ann" }, b: { userId: "ben", name: "ben" } };
    const { matchId } = createQueuedMatch(db, {
      ...params,
      players: [
        { seat: "a", ...players.a },
        { seat: "b", ...players.b },
      ],
    });
    runtime.start({ matchId, ...params, players });

    const live = (await app.inject({ method: "GET", url: "/api/admin/live", headers: admin("sue") })).json();
    expect(live.matches).toEqual([
      expect.objectContaining({
        id: matchId,
        live: true,
        players: [expect.objectContaining({ name: "ann" }), expect.objectContaining({ name: "ben" })],
      }),
    ]);

    // Support can look but not void.
    const supportVoid = await app.inject({
      method: "POST",
      url: `/api/admin/matches/${matchId}/void`,
      headers: admin("sue"),
      payload: { reason: "bug" },
    });
    expect(supportVoid.statusCode).toBe(403);

    const voided = await app.inject({
      method: "POST",
      url: `/api/admin/matches/${matchId}/void`,
      headers: admin("boss"),
      payload: { reason: "Server bug in round 1" },
    });
    expect(voided.json()).toMatchObject({ status: "cancelled", live: false });
    expect(readWallet(db, "ann", "rac")).toEqual({ available: 100, locked: 0 });
    expect(readWallet(db, "ben", "rac")).toEqual({ available: 100, locked: 0 });

    const again = await app.inject({
      method: "POST",
      url: `/api/admin/matches/${matchId}/void`,
      headers: admin("boss"),
      payload: { reason: "again" },
    });
    expect(again.json().error.message).toBe("Only a match that is still running can be voided.");

    const found = (await app.inject({ method: "GET", url: "/api/admin/matches?q=ann", headers: admin("boss") })).json();
    expect(found.matches[0]).toMatchObject({ id: matchId, status: "cancelled" });
    const audit = db.prepare("SELECT details FROM admin_audit WHERE action = 'match.voided'").get() as { details: string };
    expect(JSON.parse(audit.details)).toMatchObject({ matchId, reason: "Server bug in round 1", players: ["ann", "ben"] });
  });
});
