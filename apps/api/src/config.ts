import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
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
  REDIS_URL: optionalText,
  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: optionalText,
  SENTRY_DSN: optionalText,
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
  redisUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  sentryDsn?: string;
};

const DEV_JWT_SECRET = "arena-dev-jwt-secret-change-me";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const jwtSecret = parsed.JWT_SECRET ?? (parsed.NODE_ENV === "production" ? undefined : DEV_JWT_SECRET);

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required in production");
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
    redisUrl: parsed.REDIS_URL,
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    sentryDsn: parsed.SENTRY_DSN || undefined,
  };
}
