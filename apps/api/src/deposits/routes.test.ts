import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../auth/jwt";
import { openWallets } from "../economy/wallet";
import { buildServer } from "../server";
import { USDT_CONTRACTS, type ChainClient } from "./chain";

const SECRET = "deposit-routes-secret";
const OURS = "0x1111111111111111111111111111111111111111";
const ANN = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function start() {
  const dir = mkdtempSync(join(tmpdir(), "arena-deposits-"));
  dirs.push(dir);
  const chain: ChainClient = {
    usdtBalance: async () => 0n,
    ping: async () => {},
    async lookup(_network, txId) {
      if (txId !== TX) return { status: "not_found" };
      return {
        status: "mined",
        confirmations: 20,
        transfers: [{ contract: USDT_CONTRACTS.bep20.contract, from: ANN, to: OURS, amount: 20n * 10n ** 18n }],
      };
    },
  };
  const server = await buildServer(
    {
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
      deposits: { addresses: { bep20: OURS }, chain: { ethRpcUrl: "http://x", bscRpcUrl: "http://x", trongridUrl: "http://x" } },
    },
    { chain },
  );
  server.db
    .prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES ('ann', 'Ann', 'ann@example.test', 'x', 'now')")
    .run();
  openWallets(server.db, "ann", "2026-01-01T00:00:00.000Z");
  const auth = { authorization: `Bearer ${signAccessToken({ sub: "ann", name: "Ann", email: "ann@example.test" }, SECRET)}` };
  return { ...server, auth };
}

describe("deposit routes", () => {
  it("needs a login", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/api/deposits" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("shows only the open networks, then saves a wallet and credits a claim", async () => {
    const { app, auth } = await start();

    const before = (await app.inject({ method: "GET", url: "/api/deposits", headers: auth })).json();
    expect(before.networks).toEqual([
      { network: "trc20", address: null, confirmations: 19 },
      { network: "bep20", address: OURS, confirmations: 15 },
      { network: "erc20", address: null, confirmations: 12 },
    ]);

    const saved = await app.inject({
      method: "POST",
      url: "/api/deposits/wallets",
      headers: auth,
      payload: { network: "bep20", address: ANN },
    });
    expect(saved.statusCode).toBe(200);

    const claimed = await app.inject({
      method: "POST",
      url: "/api/deposits/claim",
      headers: auth,
      payload: { network: "bep20", txId: TX },
    });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json().deposit).toMatchObject({ amount: 20_000_000, fee: 200_000, credited: 19_800_000 });

    const me = (await app.inject({ method: "GET", url: "/api/me", headers: auth })).json();
    expect(me.wallets).toContainEqual({ currency: "usdt", available: 19_800_000, locked: 0 });

    const again = await app.inject({
      method: "POST",
      url: "/api/deposits/claim",
      headers: auth,
      payload: { network: "bep20", txId: TX },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("already_claimed");

    await app.close();
  });
});
