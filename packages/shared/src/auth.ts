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
} as const;
