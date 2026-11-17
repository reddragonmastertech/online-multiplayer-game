import { z } from "zod";
import { isoDateSchema, userIdSchema } from "./common";
import { walletSchema } from "./economy";

export const displayNameSchema = z.string().trim().min(2).max(24);
export const emailSchema = z.string().trim().pipe(z.email());
export const passwordSchema = z.string().min(8).max(128);

export const userSchema = z.object({
  id: userIdSchema,
  name: displayNameSchema,
  email: emailSchema,
  createdAt: isoDateSchema,
  /** Present for admins only. Set by the owner or `pnpm admin`, never by the player. */
  role: z.enum(["owner", "finance", "moderator", "support"]).optional(),
});
export type User = z.infer<typeof userSchema>;

export const signupRequestSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authSuccessSchema = z.object({
  token: z.string().min(1),
  user: userSchema,
  wallets: z.array(walletSchema),
});
export type AuthSuccess = z.infer<typeof authSuccessSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  wallets: z.array(walletSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const socketAuthSchema = z.object({
  token: z.string().min(1),
});
export type SocketAuth = z.infer<typeof socketAuthSchema>;

export const apiPaths = {
  health: "/health",
  signup: "/api/auth/signup",
  login: "/api/auth/login",
  me: "/api/me",
  matches: "/api/matches",
  live: "/api/live",
  deposits: "/api/deposits",
  depositWallets: "/api/deposits/wallets",
  depositClaim: "/api/deposits/claim",
  withdrawals: "/api/withdrawals",
  adminWithdrawals: "/api/admin/withdrawals",
  /** POST `{ action: "paid", txId }` or `{ action: "reject", reason }`. */
  adminWithdrawalDecision: "/api/admin/withdrawals/:id",
  adminGate: "/api/admin/gate",
  admin2faSetup: "/api/admin/2fa/setup",
  admin2faEnable: "/api/admin/2fa/enable",
  adminSession: "/api/admin/session",
  adminDashboard: "/api/admin/dashboard",
  adminPlayers: "/api/admin/players",
  adminPlayer: "/api/admin/players/:id",
  adminPlayerAction: "/api/admin/players/:id/:action",
  adminAudit: "/api/admin/audit",
  adminAdmins: "/api/admin/admins",
  adminDeposits: "/api/admin/deposits",
  adminDepositsManual: "/api/admin/deposits/manual",
  adminSolvency: "/api/admin/solvency",
  adminSweeps: "/api/admin/sweeps",
  adminBackups: "/api/admin/backups",
  site: "/api/site",
  adminSite: "/api/admin/site",
  adminLive: "/api/admin/live",
  adminMatches: "/api/admin/matches",
  adminMatch: "/api/admin/matches/:id",
  adminMatchVoid: "/api/admin/matches/:id/void",
} as const;
