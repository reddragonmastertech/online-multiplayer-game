import { randomUUID } from "node:crypto";
import {
  apiPaths,
  loginRequestSchema,
  MATCH_RULES,
  signupRequestSchema,
} from "@game-platform/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
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
import { readBearerToken, signAccessToken, verifyAccessToken } from "./jwt";
import { hashPassword, verifyPassword } from "./password";
import { findUserByEmail, loadAccount, toPublicUser, toPublicWallets } from "./session";

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

function authenticate(request: FastifyRequest, jwtSecret: string) {
  const token = readBearerToken(request.headers.authorization);
  if (!token) {
    throw unauthorized();
  }

  try {
    return verifyAccessToken(token, jwtSecret);
  } catch {
    throw unauthorized();
  }
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { db: AppDatabase; jwtSecret: string },
) {
  const { db, jwtSecret } = deps;

  app.post(apiPaths.signup, async (request, reply) => {
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
        db.prepare(
          "INSERT INTO wallets (user_id, currency, available, locked) VALUES (?, 'rac', ?, 0)",
        ).run(user.id, MATCH_RULES.signupBonusRac);
        db.prepare(
          "INSERT INTO ledger_entries (id, user_id, currency, kind, amount, match_id, created_at) VALUES (?, ?, 'rac', 'signup_bonus', ?, NULL, ?)",
        ).run(randomUUID(), user.id, MATCH_RULES.signupBonusRac, now);
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
      wallets: toPublicWallets({ available: MATCH_RULES.signupBonusRac, locked: 0 }),
    };
  });

  app.post(apiPaths.login, async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, invalidInput());
    }

    const email = parsed.data.email.toLowerCase();
    const user = findUserByEmail(db, email);
    if (!user || !(await verifyPassword(parsed.data.password, String(user.password_hash ?? "")))) {
      return sendError(reply, invalidCredentials());
    }

    const account = loadAccount(db, user.id);
    if (!account) {
      return sendError(reply, invalidCredentials());
    }

    return {
      token: signAccessToken({ sub: user.id, name: user.name, email: user.email }, jwtSecret),
      ...account,
    };
  });

  app.get(apiPaths.me, async (request, reply) => {
    try {
      const payload = authenticate(request, jwtSecret);
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
}
