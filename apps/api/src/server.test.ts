import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./config";
import type { AppDatabase } from "./db/client";
import { lockRacStake, readRacWallet } from "./economy/wallet";
import { createQueuedMatch } from "./match/store";
import { buildServer } from "./server";

const dirs: string[] = [];

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dir = mkdtempSync(join(tmpdir(), "arena-test-"));
  dirs.push(dir);

  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    webOrigin: "http://localhost:5173",
    databaseUrl: `file:${join(dir, "test.db")}`,
    jwtSecret: "test-secret",
    logLevel: "fatal",
    trustProxy: false,
    signupRateLimit: 100,
    loginRateLimit: 100,
    // Never pick up a real build during tests.
    webDist: join(dir, "no-such-dist"),
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedPlayers(db: AppDatabase) {
  for (const id of ["alice", "bob"]) {
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, 'x', '2026-01-01T00:00:00.000Z')",
    ).run(id, `Player ${id}`, `${id}@example.test`);
    db.prepare(
      "INSERT INTO wallets (user_id, currency, available, locked) VALUES (?, 'rac', 100, 0)",
    ).run(id);
  }
}

describe("server lifecycle", () => {
  it("starts without a built web bundle and still answers the API", async () => {
    const { app, web } = await buildServer(testConfig());

    expect(web.served).toBe(false);

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.json()).toEqual({ status: "ok" });

    const live = await app.inject({ method: "GET", url: "/api/live" });
    expect(live.json()).toEqual({ matches: [] });

    await app.close();
  });

  /**
   * PM2 and systemd restart with a signal; the handler calls app.close(). A
   * match cannot survive that, so the stakes must come back rather than stay
   * locked until something starts again.
   */
  it("refunds a match that was still running when it shut down", async () => {
    const config = testConfig();
    const { app, db } = await buildServer(config);
    seedPlayers(db);

    lockRacStake(db, { userId: "alice", stake: 10 });
    lockRacStake(db, { userId: "bob", stake: 10 });
    const { matchId } = createQueuedMatch(db, {
      gameId: "rps",
      mode: "first-to-2",
      currency: "rac",
      stake: 10,
      players: [
        { seat: "a", userId: "alice", name: "Player alice" },
        { seat: "b", userId: "bob", name: "Player bob" },
      ],
    });

    expect(readRacWallet(db, "alice")).toEqual({ available: 90, locked: 10 });

    await app.close();

    // Reopen the same file: the refund must be on disk, not just in memory.
    const { app: reopened, db: after } = await buildServer(config);

    expect(readRacWallet(after, "alice")).toEqual({ available: 100, locked: 0 });
    expect(readRacWallet(after, "bob")).toEqual({ available: 100, locked: 0 });

    const row = after.prepare("SELECT status FROM matches WHERE id = ?").get(matchId) as {
      status: string;
    };
    expect(row.status).toBe("cancelled");

    await reopened.close();
  });

  it("closes cleanly twice without throwing", async () => {
    const { app } = await buildServer(testConfig());
    await app.close();
    await app.close();
  });

  it("rejects a signup flood from one caller", async () => {
    const { app } = await buildServer(testConfig({ signupRateLimit: 2 }));

    const attempt = (n: number) =>
      app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: { name: `Flood${n}`, email: `flood${n}@example.test`, password: "password123" },
      });

    expect((await attempt(1)).statusCode).toBe(200);
    expect((await attempt(2)).statusCode).toBe(200);

    const blocked = await attempt(3);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("rate_limited");

    await app.close();
  });

  it("leaves the rest of the API open when auth is rate limited", async () => {
    const { app } = await buildServer(testConfig({ signupRateLimit: 1 }));

    await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { name: "First", email: "first@example.test", password: "password123" },
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { name: "Second", email: "second@example.test", password: "password123" },
    });
    expect(blocked.statusCode).toBe(429);

    expect((await app.inject({ method: "GET", url: "/api/live" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);

    await app.close();
  });
});
