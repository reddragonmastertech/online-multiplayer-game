import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt";
import { adjustBalance, openWallets } from "../economy/wallet";
import { USDT_CONTRACTS, type ChainClient } from "../deposits/chain";
import { buildServer } from "../server";

const SECRET = "withdrawal-routes-secret";
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "arena-withdrawals-"));
  dirs.push(dir);
  // The payout check reads the chain; this fake shows 9.9 USDT reaching Ann.
  const chain: ChainClient = {
    usdtBalance: async () => 0n,
    ping: async () => {},
    lookup: async () => ({
      status: "mined",
      confirmations: 20,
      transfers: [
        {
          contract: USDT_CONTRACTS.bep20.contract,
          from: "0x9999999999999999999999999999999999999999",
          to: "0x2222222222222222222222222222222222222222",
          amount: 9_900_000n * 10n ** 12n,
        },
      ],
    }),
  };
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
  }, { chain });
  for (const [id, role] of [
    ["ann", null],
    ["boss", "owner"],
  ] as const) {
    server.db
      .prepare("INSERT INTO users (id, name, email, password_hash, created_at, role, totp_enabled) VALUES (?, ?, ?, 'x', 'now', ?, ?)")
      .run(id, id, `${id}@example.test`, role, role ? 1 : 0);
    openWallets(server.db, id, "2026-01-01T00:00:00.000Z");
  }
  server.db
    .prepare("INSERT INTO deposit_wallets (user_id, network, address, created_at) VALUES ('ann', 'bep20', ?, 'now')")
    .run("0x2222222222222222222222222222222222222222");
  adjustBalance(server.db, { userId: "ann", currency: "usdt", amount: 12_000_000 });

  const headers = (id: string) => ({
    authorization: `Bearer ${signAccessToken({ sub: id, name: id, email: `${id}@example.test` }, SECRET)}`,
  });
  // What an admin holds after passing a two-factor code.
  const adminHeaders = (id: string) => ({
    authorization: `Bearer ${signAccessToken({ sub: id, name: id, email: `${id}@example.test`, scope: "admin" }, SECRET, 3600)}`,
  });
  return { ...server, headers, adminHeaders };
}

describe("withdrawal routes", () => {
  it("runs a request through to paid, and keeps players out of the admin endpoints", async () => {
    const { app, headers, adminHeaders } = await start();

    const me = (await app.inject({ method: "GET", url: "/api/me", headers: headers("boss") })).json();
    expect(me.user.role).toBe("owner");
    const ann = (await app.inject({ method: "GET", url: "/api/me", headers: headers("ann") })).json();
    expect(ann.user.role).toBeUndefined();

    const requested = await app.inject({
      method: "POST",
      url: "/api/withdrawals",
      headers: headers("ann"),
      payload: { network: "bep20", amount: 10_000_000 },
    });
    expect(requested.statusCode).toBe(200);
    const { id } = requested.json().withdrawal;

    // A player's own login token is refused by the admin API.
    const asPlayer = await app.inject({ method: "GET", url: "/api/admin/withdrawals", headers: headers("ann") });
    expect(asPlayer.statusCode).toBe(401);
    // Even a forged-looking admin-scope token is refused without a role.
    const playerWithAdminScope = await app.inject({ method: "GET", url: "/api/admin/withdrawals", headers: adminHeaders("ann") });
    expect(playerWithAdminScope.statusCode).toBe(403);
    // An admin's normal login token is not enough: it needs the two-factor session.
    const bossWithoutCode = await app.inject({ method: "GET", url: "/api/admin/withdrawals", headers: headers("boss") });
    expect(bossWithoutCode.statusCode).toBe(401);
    expect(bossWithoutCode.json().error.code).toBe("two_factor_required");
    const decideAsPlayer = await app.inject({
      method: "POST",
      url: `/api/admin/withdrawals/${id}`,
      headers: adminHeaders("ann"),
      payload: { action: "reject", reason: "self-service" },
    });
    expect(decideAsPlayer.statusCode).toBe(403);

    const list = (await app.inject({ method: "GET", url: "/api/admin/withdrawals", headers: adminHeaders("boss") })).json();
    expect(list.withdrawals).toEqual([expect.objectContaining({ id, userName: "ann", payout: 9_900_000, status: "pending" })]);

    const claimed = await app.inject({
      method: "POST",
      url: `/api/admin/withdrawals/${id}`,
      headers: adminHeaders("boss"),
      payload: { action: "claim" },
    });
    expect(claimed.json().withdrawal.status).toBe("processing");

    const paid = await app.inject({
      method: "POST",
      url: `/api/admin/withdrawals/${id}`,
      headers: adminHeaders("boss"),
      payload: { action: "paid", txId: `0x${"cd".repeat(32)}` },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().withdrawal.status).toBe("paid");

    const after = (await app.inject({ method: "GET", url: "/api/me", headers: headers("ann") })).json();
    expect(after.wallets).toContainEqual({ currency: "usdt", available: 2_000_000, locked: 0 });

    await app.close();
  });
});
