import rateLimit from "@fastify/rate-limit";
import {
  adminAdjustSchema,
  adminCodeSchema,
  adminFreezeSchema,
  adminManualDepositSchema,
  adminNoteSchema,
  adminPlayerActions,
  adminReasonSchema,
  adminReleaseWalletSchema,
  adminRenameSchema,
  adminRoleUpdateSchema,
  adminStatusSchema,
  adminSweepSchema,
  adminVoidSchema,
  siteSettingsSchema,
  apiPaths,
  type AdminPlayerAction,
} from "@game-platform/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { z } from "zod";
import { authenticateAdmin, authenticateAdminAccount, type AuthContext } from "../auth/guard";
import { HttpError, invalidInput, notFound, sendError } from "../http/errors";
import type { DepositNetwork } from "@game-platform/shared";
import type { ChainClient } from "../deposits/chain";
import type { DepositService } from "../deposits/service";
import { checkSolvency, createBackup, houseAvailable, listSweeps, recordSweep, reconcileUsdt, type BackupSettings } from "./books";
import { recordAudit } from "./audit";
import type { AdminMatches } from "./matches";
import { readSiteSettings, writeSiteSettings } from "./settings";
import type { AdminActor, AdminService } from "./service";

async function respond<T>(reply: FastifyReply, work: () => T | Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) return sendError(reply, error);
    throw error;
  }
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: { service: AdminService; auth: AuthContext; codeRateLimit?: number },
) {
  const { service, auth } = deps;

  /* Before a session: these take the admin's normal login token. */

  app.get(apiPaths.adminGate, async (request, reply) =>
    respond(reply, () => service.gate(authenticateAdminAccount(request, auth).userId)),
  );

  // Codes are six digits, so guessing must be slow: few tries per minute.
  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: deps.codeRateLimit ?? 10,
      timeWindow: "1 minute",
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: { code: "rate_limited", message: "Too many codes. Wait a minute and try again." },
      }),
    });

    scope.post(apiPaths.admin2faSetup, async (request, reply) =>
      respond(reply, () => service.setupTotp(authenticateAdminAccount(request, auth).userId)),
    );
    scope.post(apiPaths.admin2faEnable, async (request, reply) =>
      respond(reply, () => {
        const account = authenticateAdminAccount(request, auth);
        return service.enableTotp(account.userId, parse(adminCodeSchema, request.body).code, request.ip);
      }),
    );
    scope.post(apiPaths.adminSession, async (request, reply) =>
      respond(reply, () => {
        const account = authenticateAdminAccount(request, auth);
        return service.startSession(account.userId, parse(adminCodeSchema, request.body).code, request.ip);
      }),
    );
  });

  /* With an admin session: each route names the permission it needs. */

  app.get(apiPaths.adminDashboard, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return service.dashboard();
    }),
  );

  app.get<{ Querystring: { q?: string } }>(apiPaths.adminPlayers, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return { players: service.searchPlayers(String(request.query.q ?? "").slice(0, 120)) };
    }),
  );

  app.get<{ Params: { id: string } }>(apiPaths.adminPlayer, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return service.playerDetail(request.params.id);
    }),
  );

  app.post<{ Params: { id: string; action: string } }>(apiPaths.adminPlayerAction, async (request, reply) =>
    respond(reply, async () => {
      const action = request.params.action as AdminPlayerAction;
      const permission = adminPlayerActions[action];
      if (!permission) throw notFound("That action does not exist.");
      const actor: AdminActor = authenticateAdmin(request, auth, permission);
      const id = request.params.id;
      const body = request.body;

      switch (action) {
        case "adjust": {
          const input = parse(adminAdjustSchema, body);
          service.adjust(actor, id, input.currency, input.amount, input.reason);
          break;
        }
        case "freeze": {
          const input = parse(adminFreezeSchema, body);
          service.setFrozen(actor, id, input.frozen, input.reason);
          break;
        }
        case "release-wallet": {
          const input = parse(adminReleaseWalletSchema, body);
          service.releaseWallet(actor, id, input.network, input.reason);
          break;
        }
        case "status": {
          const input = parse(adminStatusSchema, body);
          service.setStatus(actor, id, input.status, input.reason);
          break;
        }
        case "rename": {
          const input = parse(adminRenameSchema, body);
          service.rename(actor, id, input.name, input.reason);
          break;
        }
        case "logout":
          service.logoutEverywhere(actor, id, parse(adminReasonSchema, body).reason);
          break;
        case "temp-password": {
          const result = await service.setTemporaryPassword(actor, id, parse(adminReasonSchema, body).reason);
          request.log.info({ adminId: actor.userId, userId: id }, "temporary password set");
          return result;
        }
        case "notes":
          service.addNote(actor, id, parse(adminNoteSchema, body).text);
          break;
        case "reset-2fa":
          service.resetTwoFactor(actor, id, parse(adminReasonSchema, body).reason);
          break;
      }

      request.log.info({ adminId: actor.userId, userId: id, action }, "admin action");
      return service.playerDetail(id);
    }),
  );

  app.get(apiPaths.adminAudit, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return { entries: service.audit() };
    }),
  );

  app.get(apiPaths.adminAdmins, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return {
        admins: service.listAdmins().map((admin) => ({
          id: admin.id,
          name: admin.name,
          role: admin.role,
          totpEnabled: admin.totp_enabled === 1,
          lastSeenAt: admin.last_seen_at,
        })),
      };
    }),
  );

  app.post(apiPaths.adminAdmins, async (request, reply) =>
    respond(reply, () => {
      const actor = authenticateAdmin(request, auth, "admins.manage");
      const input = parse(adminRoleUpdateSchema, request.body);
      service.setRole(actor, input.name, input.role);
      return { ok: true };
    }),
  );
}

/** Roadmap 4.2 part D2: deposits, the books, sweeps and backups. */
export function registerMoneyRoutes(
  app: FastifyInstance,
  deps: {
    auth: AuthContext;
    deposits: DepositService;
    chain: ChainClient;
    addresses: Partial<Record<DepositNetwork, string>>;
    backup: BackupSettings;
  },
) {
  const { auth, deposits } = deps;

  app.get<{ Querystring: { q?: string; userId?: string } }>(apiPaths.adminDeposits, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      const userId = request.query.userId ? String(request.query.userId) : undefined;
      return {
        deposits: userId ? [] : deposits.adminList(String(request.query.q ?? "").slice(0, 120)),
        attempts: deposits.attempts(userId),
      };
    }),
  );

  app.post(apiPaths.adminDepositsManual, async (request, reply) =>
    respond(reply, async () => {
      const actor = authenticateAdmin(request, auth, "money.adjust");
      const input = parse(adminManualDepositSchema, request.body);
      const deposit = await deposits.manualCredit(actor, input.userId, input.network, input.txId, input.reason);
      request.log.info({ adminId: actor.userId, userId: input.userId, txId: deposit.txId }, "manual deposit credited");
      return { deposit };
    }),
  );

  app.get(apiPaths.adminSolvency, async (request, reply) =>
    respond(reply, async () => {
      authenticateAdmin(request, auth, "view");
      return {
        reconciliation: reconcileUsdt(auth.db),
        solvency: await checkSolvency(auth.db, deps.chain, deps.addresses),
      };
    }),
  );

  app.get(apiPaths.adminSweeps, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return { available: houseAvailable(auth.db), sweeps: listSweeps(auth.db) };
    }),
  );

  app.post(apiPaths.adminSweeps, async (request, reply) =>
    respond(reply, () => {
      const actor = authenticateAdmin(request, auth, "money.adjust");
      const input = parse(adminSweepSchema, request.body);
      recordSweep(auth.db, actor, input.amount, input.note);
      return { available: houseAvailable(auth.db), sweeps: listSweeps(auth.db) };
    }),
  );

  app.post(apiPaths.adminBackups, async (request, reply) =>
    respond(reply, () => {
      const actor = authenticateAdmin(request, auth, "admins.manage");
      return { backup: createBackup(auth.db, deps.backup, actor.userId) };
    }),
  );
}

/** Roadmap 4.2 part D3: site switches, the live view, match search and voiding. */
export function registerControlRoutes(
  app: FastifyInstance,
  deps: {
    auth: AuthContext;
    matches: AdminMatches;
    voidMatch: (matchId: string) => boolean;
  },
) {
  const { auth, matches } = deps;

  // Public: every page reads these for the banner and for what is open.
  app.get(apiPaths.site, async () => readSiteSettings(auth.db));

  app.get(apiPaths.adminSite, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return readSiteSettings(auth.db);
    }),
  );

  app.post(apiPaths.adminSite, async (request, reply) =>
    respond(reply, () => {
      const actor = authenticateAdmin(request, auth, "site.control");
      const next = parse(siteSettingsSchema, request.body);
      const saved = writeSiteSettings(auth.db, actor, next);
      request.log.warn({ adminId: actor.userId, settings: saved }, "site settings changed");
      return saved;
    }),
  );

  app.get(apiPaths.adminLive, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return matches.live();
    }),
  );

  app.get<{ Querystring: { q?: string } }>(apiPaths.adminMatches, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return { matches: matches.search(String(request.query.q ?? "").slice(0, 120)) };
    }),
  );

  app.get<{ Params: { id: string } }>(apiPaths.adminMatch, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return matches.detail(request.params.id);
    }),
  );

  app.post<{ Params: { id: string } }>(apiPaths.adminMatchVoid, async (request, reply) =>
    respond(reply, () => {
      const actor = authenticateAdmin(request, auth, "players.moderate");
      const { reason } = parse(adminVoidSchema, request.body);
      const before = matches.detail(request.params.id);
      if (!before.live) throw invalidInput("Only a match that is still running can be voided.");
      if (!deps.voidMatch(request.params.id)) throw invalidInput("That match has just ended.");
      recordAudit(auth.db, {
        adminId: actor.userId,
        action: "match.voided",
        targetUserId: before.players[0]?.userId ?? null,
        details: {
          matchId: before.id,
          reason,
          currency: before.currency,
          stake: before.stake,
          players: before.players.map((player) => player.name),
        },
        ip: actor.ip,
      });
      return matches.detail(request.params.id);
    }),
  );
}
