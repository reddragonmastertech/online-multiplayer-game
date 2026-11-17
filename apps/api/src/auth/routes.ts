import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import {
  apiPaths,
  loginRequestSchema,
  signupRequestSchema,
} from "@game-platform/shared";
import type { FastifyInstance } from "fastify";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import {
  emailTaken,
  HttpError,
  invalidCredentials,
  invalidInput,
  sendError,
  unauthorized,
} from "../http/errors";
import { authenticate, suspended } from "./guard";
import { recordLogin } from "./login-events";
import { loadMatchHistory } from "../match/history";
import { signAccessToken } from "./jwt";
import { hashPassword, verifyPassword } from "./password";
import { openWallets, readWallets } from "../economy/wallet";
import { findUserByEmail, loadAccount, toPublicUser } from "./session";

function uniqueConstraintColumn(error: unknown) {
  if (!(error instanceof Error) || !error.message.includes("UNIQUE constraint failed")) {
    return undefined;
  }

  if (error.message.includes("users.email") || error.message.includes("users_email_unique")) {
    return "email";
  }

  if (error.message.includes("users.name") || error.message.includes("users_name_unique")) {
    return "name";
  }

  return "unknown";
}

/**
 * `statusCode` here is what sets the response code; without it the plugin's
 * error reaches the default handler and the caller sees a 500.
 */
const tooManyAttempts = () => ({
  statusCode: 429,
  error: {
    code: "rate_limited",
    message: "Too many attempts. Wait a moment and try again.",
  },
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: {
    db: AppDatabase;
    jwtSecret: string;
    signupRateLimit: number;
    loginRateLimit: number;
  },
) {
  const { db, jwtSecret } = deps;

  /**
   * Signup mints the RAC bonus and login is a password oracle, so both are
   * capped per client IP once this is reachable from the internet. Each lives
   * in its own encapsulated scope so the two windows do not share a counter.
   */
  async function limited(
    max: number,
    timeWindow: string,
    routes: (scope: FastifyInstance) => void,
  ) {
    await app.register(async (scope) => {
      await scope.register(rateLimit, {
        max,
        timeWindow,
        errorResponseBuilder: tooManyAttempts,
      });
      routes(scope);
    });
  }

  await limited(deps.signupRateLimit, "1 hour", (scope) => {
    scope.post(apiPaths.signup, async (request, reply) => {
      const parsed = signupRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, invalidInput());
      }

      const email = parsed.data.email.toLowerCase();
      const passwordHash = await hashPassword(parsed.data.password);
      const now = new Date().toISOString();
      const user = {
        id: randomUUID(),
        name: parsed.data.name,
        email,
        passwordHash,
        createdAt: now,
      };

      try {
        withTransaction(db, () => {
          db.prepare(
            "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
          ).run(user.id, user.name, user.email, user.passwordHash, user.createdAt);
          openWallets(db, user.id, now);
          recordLogin(db, { userId: user.id, kind: "signup", ip: request.ip, userAgent: request.headers["user-agent"] });
        });
      } catch (error) {
        const column = uniqueConstraintColumn(error);
        if (column === "email") {
          return sendError(reply, emailTaken());
        }
        if (column === "name") {
          return sendError(reply, invalidInput("That display name is already taken."));
        }
        throw error;
      }

      return {
        token: signAccessToken({ sub: user.id, name: user.name, email: user.email }, jwtSecret),
        user: toPublicUser(user),
        wallets: readWallets(db, user.id),
      };
    });
  });

  await limited(deps.loginRateLimit, "1 minute", (scope) => {
    scope.post(apiPaths.login, async (request, reply) => {
      const parsed = loginRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, invalidInput());
      }

      const email = parsed.data.email.toLowerCase();
      const user = findUserByEmail(db, email);
      if (!user || !(await verifyPassword(parsed.data.password, String(user.password_hash ?? "")))) {
        return sendError(reply, invalidCredentials());
      }
      if (user.status === "suspended") {
        return sendError(reply, suspended());
      }

      const account = loadAccount(db, user.id);
      if (!account) {
        return sendError(reply, invalidCredentials());
      }
      recordLogin(db, { userId: user.id, kind: "login", ip: request.ip, userAgent: request.headers["user-agent"] });

      return {
        token: signAccessToken(
          { sub: user.id, name: user.name, email: user.email, tv: user.token_version ?? 0 },
          jwtSecret,
        ),
        ...account,
      };
    });
  });

  app.get(apiPaths.me, async (request, reply) => {
    try {
      const payload = authenticate(request, { db, jwtSecret });
      db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), payload.sub);
      const account = loadAccount(db, payload.sub);
      if (!account) {
        return sendError(reply, unauthorized());
      }
      return account;
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(reply, error);
      }
      throw error;
    }
  });

  app.get(apiPaths.matches, async (request, reply) => {
    try {
      const payload = authenticate(request, { db, jwtSecret });
      return { matches: loadMatchHistory(db, payload.sub) };
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(reply, error);
      }
      throw error;
    }
  });
}
