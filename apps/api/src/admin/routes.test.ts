import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt";
import { adjustBalance, openWallets, readWallet } from "../economy/wallet";
import { buildServer } from "../server";
import { totpCode, totpStep } from "./totp";

/** The admin area over HTTP: two-factor, roles, actions and the audit log. */

const SECRET = "admin-routes-secret";
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "arena-admin-"));
  dirs.push(dir);
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
  const people: [string, string | null][] = [
    ["ann", null],
    ["boss", "owner"],
    ["sue", "support"],
    ["fin", "finance"],
  ];
  for (const [id, role] of people) {
    server.db
      .prepare("INSERT INTO users (id, name, email, password_hash, created_at, role) VALUES (?, ?, ?, 'x', ?, ?)")
      .run(id, id, `${id}@example.test`, new Date().toISOString(), role);
    openWallets(server.db, id, "2026-01-01T00:00:00.000Z");
  }
  server.db
    .prepare("INSERT INTO deposit_wallets (user_id, network, address, created_at) VALUES ('ann', 'trc20', ?, 'now')")
    .run("TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E");

  const login = (id: string) => ({
    authorization: `Bearer ${signAccessToken({ sub: id, name: id, email: `${id}@example.test` }, SECRET)}`,
  });

  /** Goes through the real two-factor setup and returns admin session headers. */
  async function adminSession(id: string) {
    const setup = (await server.app.inject({ method: "POST", url: "/api/admin/2fa/setup", headers: login(id) })).json();
    const enabled = await server.app.inject({
      method: "POST",
      url: "/api/admin/2fa/enable",
      headers: login(id),
      payload: { code: totpCode(setup.secret, totpStep()) },
    });
    expect(enabled.statusCode).toBe(200);
    return { authorization: `Bearer ${enabled.json().token}` };
  }

  return { ...server, login, adminSession };
}

describe("admin two-factor", () => {
  it("sets up two-factor, opens a session, and refuses reused or wrong codes", async () => {
    const { app, login } = await start();

    const gate = (await app.inject({ method: "GET", url: "/api/admin/gate", headers: login("boss") })).json();
    expect(gate).toEqual({ role: "owner", totpEnabled: false });

    // No session without two-factor set up.
    const early = await app.inject({ method: "POST", url: "/api/admin/session", headers: login("boss"), payload: { code: "123456" } });
    expect(early.json().error.code).toBe("two_factor_required");

    const setup = (await app.inject({ method: "POST", url: "/api/admin/2fa/setup", headers: login("boss") })).json();
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/PvP%20Arena%3Aboss%40example\.test\?secret=/);

    const wrong = await app.inject({ method: "POST", url: "/api/admin/2fa/enable", headers: login("boss"), payload: { code: "000000" } });
    expect(wrong.statusCode).toBe(400);

    const code = totpCode(setup.secret, totpStep());
    const enabled = await app.inject({ method: "POST", url: "/api/admin/2fa/enable", headers: login("boss"), payload: { code } });
    expect(enabled.statusCode).toBe(200);
    const session = { authorization: `Bearer ${enabled.json().token}` };
    expect((await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: session })).statusCode).toBe(200);

    // The same code cannot open a second session.
    const replay = await app.inject({ method: "POST", url: "/api/admin/session", headers: login("boss"), payload: { code } });
    expect(replay.statusCode).toBe(400);

    // A player gets nowhere.
    expect((await app.inject({ method: "GET", url: "/api/admin/gate", headers: login("ann") })).statusCode).toBe(403);

    await app.close();
  });
});

describe("admin roles and actions", () => {
  it("lets each role do only its own job, and audits every change", async () => {
    const { app, db, adminSession } = await start();
    const support = await adminSession("sue");
    const finance = await adminSession("fin");
    const owner = await adminSession("boss");

    // Support can look but not touch.
    expect((await app.inject({ method: "GET", url: "/api/admin/players/ann", headers: support })).statusCode).toBe(200);
    const supportAdjust = await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/adjust",
      headers: support,
      payload: { currency: "usdt", amount: 5_000_000, reason: "goodwill" },
    });
    expect(supportAdjust.statusCode).toBe(403);

    // Finance can adjust balances, with a reason, but cannot suspend.
    const adjusted = await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/adjust",
      headers: finance,
      payload: { currency: "usdt", amount: 5_000_000, reason: "goodwill" },
    });
    expect(adjusted.statusCode).toBe(200);
    expect(adjusted.json().wallets).toContainEqual({ currency: "usdt", available: 5_000_000, locked: 0 });
    const noReason = await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/adjust",
      headers: finance,
      payload: { currency: "usdt", amount: 1, reason: "" },
    });
    expect(noReason.statusCode).toBe(400);
    const financeSuspend = await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/status",
      headers: finance,
      payload: { status: "suspended", reason: "test" },
    });
    expect(financeSuspend.statusCode).toBe(403);

    // The owner can do anything; managing admins is owner-only.
    const financeRoles = await app.inject({ method: "POST", url: "/api/admin/admins", headers: finance, payload: { name: "ann", role: "support" } });
    expect(financeRoles.statusCode).toBe(403);

    const audit = (await app.inject({ method: "GET", url: "/api/admin/audit", headers: owner })).json().entries;
    expect(audit[0]).toMatchObject({
      adminName: "fin",
      action: "player.balance_adjusted",
      targetName: "ann",
      details: { currency: "usdt", amount: 5_000_000, reason: "goodwill" },
    });
    expect(readWallet(db, "ann", "usdt")?.available).toBe(5_000_000);

    await app.close();
  });

  it("suspends a player, which ends their session at once", async () => {
    const { app, login, adminSession } = await start();
    const owner = await adminSession("boss");
    const annToken = login("ann");
    expect((await app.inject({ method: "GET", url: "/api/me", headers: annToken })).statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/status",
      headers: owner,
      payload: { status: "suspended", reason: "chargeback" },
    });

    const after = await app.inject({ method: "GET", url: "/api/me", headers: annToken });
    expect(after.statusCode).toBe(403);
    expect(after.json().error.code).toBe("account_suspended");

    await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/status",
      headers: owner,
      payload: { status: "active", reason: "resolved" },
    });
    expect((await app.inject({ method: "GET", url: "/api/me", headers: annToken })).statusCode).toBe(200);

    await app.close();
  });

  it("logs a player out everywhere and sets a temporary password", async () => {
    const { app, adminSession, login } = await start();
    const owner = await adminSession("boss");
    const annToken = login("ann");

    const temp = await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/temp-password",
      headers: owner,
      payload: { reason: "forgot password" },
    });
    expect(temp.json().password).toMatch(/^[a-zA-Z2-9]{12}$/);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: annToken })).json().error.message).toBe(
      "Your session has ended. Log in again.",
    );

    const loggedIn = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ann@example.test", password: temp.json().password },
    });
    expect(loggedIn.statusCode).toBe(200);

    await app.close();
  });

  it("finds players by wallet, freezes USDT, releases a wallet and keeps one owner", async () => {
    const { app, db, adminSession } = await start();
    const owner = await adminSession("boss");

    const found = (await app.inject({ method: "GET", url: "/api/admin/players?q=TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E", headers: owner })).json();
    expect(found.players.map((p: { id: string }) => p.id)).toEqual(["ann"]);

    await app.inject({ method: "POST", url: "/api/admin/players/ann/freeze", headers: owner, payload: { frozen: true, reason: "review" } });
    adjustBalance(db, { userId: "ann", currency: "usdt", amount: 20_000_000 });
    const blocked = await app.inject({
      method: "POST",
      url: "/api/withdrawals",
      headers: { authorization: `Bearer ${signAccessToken({ sub: "ann", name: "ann", email: "ann@example.test" }, SECRET)}` },
      payload: { network: "trc20", amount: 10_000_000 },
    });
    expect(blocked.json().error.message).toBe("Your USDT is frozen. Contact support.");

    const released = await app.inject({
      method: "POST",
      url: "/api/admin/players/ann/release-wallet",
      headers: owner,
      payload: { network: "trc20", reason: "wallet belongs to someone else" },
    });
    expect(released.json().savedWallets).toEqual([]);

    const lastOwner = await app.inject({ method: "POST", url: "/api/admin/admins", headers: owner, payload: { name: "boss", role: null } });
    expect(lastOwner.json().error.message).toBe("There must always be at least one owner.");

    const dashboard = (await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: owner })).json();
    expect(dashboard.players.total).toBe(4);
    expect(dashboard.money.usdtHeld.available).toBe(20_000_000);
    expect(dashboard.alerts).toEqual([]);

    await app.close();
  });
});
