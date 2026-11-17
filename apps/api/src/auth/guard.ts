import { can, type AdminPermission, type AdminRole } from "@game-platform/shared";
import type { FastifyRequest } from "fastify";
import type { AppDatabase } from "../db/client";
import { HttpError, unauthorized } from "../http/errors";
import { readBearerToken, verifyAccessToken, type AccessTokenPayload } from "./jwt";

/**
 * Who is calling. A token alone is not enough: the account must still exist,
 * not be suspended, and the token must carry the current token version, so
 * a suspension, a password reset or "log out everywhere" ends live sessions
 * at once. Admin calls need an admin session token on top of that.
 */

export type AuthContext = { db: AppDatabase; jwtSecret: string };

type AuthRow = {
  id: string;
  name: string;
  status: string;
  token_version: number;
  role: AdminRole | null;
  totp_enabled: number;
};

function loadAuthRow(db: AppDatabase, userId: string) {
  return db
    .prepare("SELECT id, name, status, token_version, role, totp_enabled FROM users WHERE id = ?")
    .get(userId) as AuthRow | undefined;
}

export const suspended = () =>
  new HttpError(403, "account_suspended", "This account is suspended. Contact support.");

/** Checks a token and the account behind it. Shared by HTTP and sockets. */
export function checkToken(token: string, auth: AuthContext, scope: "player" | "admin" = "player") {
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token, auth.jwtSecret);
  } catch {
    throw unauthorized();
  }
  if ((payload.scope ?? "player") !== scope) throw unauthorized();

  const row = loadAuthRow(auth.db, payload.sub);
  if (!row) throw unauthorized();
  if (row.status === "suspended") throw suspended();
  if ((payload.tv ?? 0) !== row.token_version) {
    throw unauthorized("Your session has ended. Log in again.");
  }
  return { payload, row };
}

/** A logged-in player (any account, admin or not) on a normal token. */
export function authenticate(request: FastifyRequest, auth: AuthContext) {
  const token = readBearerToken(request.headers.authorization);
  if (!token) throw unauthorized();
  return checkToken(token, auth).payload;
}

/** The account behind a normal token, when it holds an admin role. */
export function authenticateAdminAccount(request: FastifyRequest, auth: AuthContext) {
  const token = readBearerToken(request.headers.authorization);
  if (!token) throw unauthorized();
  const { row } = checkToken(token, auth);
  if (!row.role) throw new HttpError(403, "forbidden", "Only an admin can do that.");
  return { userId: row.id, name: row.name, role: row.role, totpEnabled: row.totp_enabled === 1 };
}

/**
 * An admin session: an admin-scope token (issued only after a two-factor
 * code), a role that still exists in the database, and the permission asked
 * for. Roles are read on every call, so taking one away works at once.
 */
export function authenticateAdmin(request: FastifyRequest, auth: AuthContext, permission: AdminPermission) {
  const token = readBearerToken(request.headers.authorization);
  if (!token) throw unauthorized();

  let checked;
  try {
    checked = checkToken(token, auth, "admin");
  } catch (error) {
    if (error instanceof HttpError && error.code === "unauthorized") {
      throw new HttpError(401, "two_factor_required", "Enter your two-factor code to continue.");
    }
    throw error;
  }

  const { row } = checked;
  if (!row.role || row.totp_enabled !== 1) throw new HttpError(403, "forbidden", "Only an admin can do that.");
  if (!can(row.role, permission)) {
    throw new HttpError(403, "forbidden", "Your admin role does not allow that.");
  }
  return { userId: row.id, name: row.name, role: row.role, ip: request.ip };
}
