import { depositNetworks } from "@game-platform/shared";
import { z } from "zod";
import type { ChainSettings } from "./deposits/client";
import { isValidAddress, type ReceivingAddresses } from "./deposits/service";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: optionalText,
  JWT_SECRET: optionalText,
  /** Overrides where the built web bundle is read from. */
  WEB_DIST: optionalText,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Set when a tunnel or reverse proxy terminates TLS in front of this. */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /**
   * Signups allowed per client IP per hour. Each one mints the RAC bonus, so
   * this is the faucet guard. Raise it when testers share one address: a house
   * or an office behind a single NAT counts as one client here.
   */
  SIGNUP_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  /** Login attempts allowed per client IP per minute. */
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  SENTRY_DSN: optionalText,
  /** Our USDT receiving addresses. A network without one stays closed. */
  USDT_ADDRESS_TRC20: optionalText,
  USDT_ADDRESS_BEP20: optionalText,
  USDT_ADDRESS_ERC20: optionalText,
  /** JSON-RPC and TronGrid endpoints used to read deposits. Free public ones by default. */
  ETH_RPC_URL: z.string().url().default("https://ethereum-rpc.publicnode.com"),
  BSC_RPC_URL: z.string().url().default("https://bsc-rpc.publicnode.com"),
  TRONGRID_URL: z.string().url().default("https://api.trongrid.io"),
  TRONGRID_API_KEY: optionalText,
  /** Browser tests only: read transactions from this JSON file instead of a chain. */
  DEPOSIT_CHAIN_FAKE_FILE: optionalText,
  /** Where daily backups go; defaults to a `backups` folder next to the database. */
  BACKUP_DIR: optionalText,
  /** How many daily backups to keep. */
  BACKUP_KEEP: z.coerce.number().int().positive().default(14),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  webOrigin: string;
  databaseUrl?: string;
  jwtSecret: string;
  webDist?: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  trustProxy: boolean;
  signupRateLimit: number;
  loginRateLimit: number;
  sentryDsn?: string;
  /** Leave out for no receiving addresses and the default public endpoints. */
  deposits?: DepositConfig;
  /** Leave out to back up next to the database, keeping 14. */
  backup?: { dir?: string; keep: number };
};

export type DepositConfig = {
  addresses: ReceivingAddresses;
  chain: ChainSettings;
  fakeChainFile?: string;
};

export const defaultDepositConfig: DepositConfig = {
  addresses: {},
  chain: {
    ethRpcUrl: "https://ethereum-rpc.publicnode.com",
    bscRpcUrl: "https://bsc-rpc.publicnode.com",
    trongridUrl: "https://api.trongrid.io",
  },
};

const DEV_JWT_SECRET = "arena-dev-jwt-secret-change-me";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const jwtSecret = parsed.JWT_SECRET ?? (parsed.NODE_ENV === "production" ? undefined : DEV_JWT_SECRET);

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required in production");
  }

  const addresses: ReceivingAddresses = {};
  for (const network of depositNetworks) {
    const address = parsed[`USDT_ADDRESS_${network.toUpperCase()}` as "USDT_ADDRESS_TRC20"];
    if (!address) continue;
    if (!isValidAddress(network, address)) {
      throw new Error(`USDT_ADDRESS_${network.toUpperCase()} is not a valid ${network.toUpperCase()} address.`);
    }
    addresses[network] = address;
  }

  if (parsed.DEPOSIT_CHAIN_FAKE_FILE && parsed.NODE_ENV === "production") {
    throw new Error("DEPOSIT_CHAIN_FAKE_FILE is for tests and cannot be used in production.");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    databaseUrl: parsed.DATABASE_URL,
    jwtSecret,
    webDist: parsed.WEB_DIST,
    logLevel: parsed.LOG_LEVEL,
    trustProxy: parsed.TRUST_PROXY,
    signupRateLimit: parsed.SIGNUP_RATE_LIMIT,
    loginRateLimit: parsed.LOGIN_RATE_LIMIT,
    sentryDsn: parsed.SENTRY_DSN || undefined,
    deposits: {
      addresses,
      chain: {
        ethRpcUrl: parsed.ETH_RPC_URL,
        bscRpcUrl: parsed.BSC_RPC_URL,
        trongridUrl: parsed.TRONGRID_URL,
        trongridApiKey: parsed.TRONGRID_API_KEY,
      },
      fakeChainFile: parsed.DEPOSIT_CHAIN_FAKE_FILE,
    },
    backup: { dir: parsed.BACKUP_DIR, keep: parsed.BACKUP_KEEP },
  };
}
