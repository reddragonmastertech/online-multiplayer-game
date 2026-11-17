import { apiPaths, withdrawalDecisionSchema, withdrawalRequestSchema } from "@game-platform/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { authenticate } from "../auth/routes";
import { HttpError, invalidInput, sendError } from "../http/errors";
import type { WithdrawalService } from "./service";

async function respond<T>(reply: FastifyReply, work: () => T | Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) return sendError(reply, error);
    throw error;
  }
}

export function registerWithdrawalRoutes(
  app: FastifyInstance,
  deps: { service: WithdrawalService; jwtSecret: string },
) {
  const { service, jwtSecret } = deps;

  app.get(apiPaths.withdrawals, async (request, reply) =>
    respond(reply, () => ({ withdrawals: service.list(authenticate(request, jwtSecret).sub) })),
  );

  app.post(apiPaths.withdrawals, async (request, reply) =>
    respond(reply, () => {
      const userId = authenticate(request, jwtSecret).sub;
      const parsed = withdrawalRequestSchema.safeParse(request.body);
      if (!parsed.success) throw invalidInput();
      const withdrawal = service.request(userId, parsed.data.network, parsed.data.amount);
      request.log.info({ userId, withdrawalId: withdrawal.id, amount: withdrawal.amount }, "withdrawal requested");
      return { withdrawal };
    }),
  );

  // Admin only. The check reads `is_admin` from the database on every call,
  // so revoking it takes effect at once, whatever the token says.
  app.get(apiPaths.adminWithdrawals, async (request, reply) =>
    respond(reply, () => ({ withdrawals: service.adminList(authenticate(request, jwtSecret).sub) })),
  );

  app.post<{ Params: { id: string } }>(apiPaths.adminWithdrawalDecision, async (request, reply) =>
    respond(reply, () => {
      const adminId = authenticate(request, jwtSecret).sub;
      const parsed = withdrawalDecisionSchema.safeParse(request.body);
      if (!parsed.success) throw invalidInput("Give a transaction ID to mark it paid, or a reason to reject it.");
      const withdrawal = service.decide(adminId, request.params.id, parsed.data);
      request.log.info(
        { adminId, withdrawalId: withdrawal.id, status: withdrawal.status, payoutTxId: withdrawal.payoutTxId },
        "withdrawal decided",
      );
      return { withdrawal };
    }),
  );
}
