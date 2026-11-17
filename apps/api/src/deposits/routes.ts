import rateLimit from "@fastify/rate-limit";
import { apiPaths, depositClaimSchema, saveDepositWalletSchema } from "@game-platform/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { authenticate, type AuthContext } from "../auth/guard";
import { HttpError, invalidInput, sendError } from "../http/errors";
import type { DepositService } from "./service";

async function respond<T>(reply: FastifyReply, work: () => T | Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) return sendError(reply, error);
    throw error;
  }
}

export async function registerDepositRoutes(
  app: FastifyInstance,
  deps: { service: DepositService; auth: AuthContext; claimRateLimit?: number },
) {
  const { service, auth } = deps;

  app.get(apiPaths.deposits, async (request, reply) =>
    respond(reply, () => service.overview(authenticate(request, auth).sub)),
  );

  app.post(apiPaths.depositWallets, async (request, reply) =>
    respond(reply, () => {
      const userId = authenticate(request, auth).sub;
      const parsed = saveDepositWalletSchema.safeParse(request.body);
      if (!parsed.success) throw invalidInput();
      return service.saveWallet(userId, parsed.data.network, parsed.data.address);
    }),
  );

  // Every claim asks a blockchain node, so cap how often one client can ask.
  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: deps.claimRateLimit ?? 20,
      timeWindow: "1 minute",
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: { code: "rate_limited", message: "Too many checks. Wait a minute and try again." },
      }),
    });

    scope.post(apiPaths.depositClaim, async (request, reply) =>
      respond(reply, async () => {
        const userId = authenticate(request, auth).sub;
        const parsed = depositClaimSchema.safeParse(request.body);
        if (!parsed.success) throw invalidInput();
        const deposit = await service.claim(userId, parsed.data.network, parsed.data.txId);
        request.log.info({ userId, network: deposit.network, txId: deposit.txId, credited: deposit.credited }, "deposit credited");
        return { deposit };
      }),
    );
  });
}
