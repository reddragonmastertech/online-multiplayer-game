import { apiPaths, withdrawalDecisionSchema, withdrawalRequestSchema } from "@game-platform/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { authenticate, authenticateAdmin, type AuthContext } from "../auth/guard";
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

export function registerWithdrawalRoutes(app: FastifyInstance, deps: { service: WithdrawalService; auth: AuthContext }) {
  const { service, auth } = deps;

  app.get(apiPaths.withdrawals, async (request, reply) =>
    respond(reply, () => ({ withdrawals: service.list(authenticate(request, auth).sub) })),
  );

  app.post(apiPaths.withdrawals, async (request, reply) =>
    respond(reply, () => {
      const userId = authenticate(request, auth).sub;
      const parsed = withdrawalRequestSchema.safeParse(request.body);
      if (!parsed.success) throw invalidInput();
      const withdrawal = service.request(userId, parsed.data.network, parsed.data.amount);
      request.log.info({ userId, withdrawalId: withdrawal.id, amount: withdrawal.amount }, "withdrawal requested");
      return { withdrawal };
    }),
  );

  // Admin sessions only (two-factor), with the role read on every call.
  app.get(apiPaths.adminWithdrawals, async (request, reply) =>
    respond(reply, () => {
      authenticateAdmin(request, auth, "view");
      return { withdrawals: service.adminList() };
    }),
  );

  app.post<{ Params: { id: string } }>(apiPaths.adminWithdrawalDecision, async (request, reply) =>
    respond(reply, () => {
      const admin = authenticateAdmin(request, auth, "withdrawals.decide");
      const parsed = withdrawalDecisionSchema.safeParse(request.body);
      if (!parsed.success) throw invalidInput("Give a transaction ID to mark it paid, or a reason to reject it.");
      const withdrawal = service.decide(admin, request.params.id, parsed.data);
      request.log.info(
        { adminId: admin.userId, withdrawalId: withdrawal.id, status: withdrawal.status, payoutTxId: withdrawal.payoutTxId },
        "withdrawal decided",
      );
      return { withdrawal };
    }),
  );
}
