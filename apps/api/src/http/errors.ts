import type { ErrorCode } from "@game-platform/shared";
import type { FastifyReply } from "fastify";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(reply: FastifyReply, error: HttpError) {
  return reply.status(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}

export function invalidInput(message = "Check the form and try again.") {
  return new HttpError(400, "invalid_input", message);
}

export function unauthorized(message = "Log in to continue.") {
  return new HttpError(401, "unauthorized", message);
}

export function emailTaken() {
  return new HttpError(409, "email_taken", "An account with that email already exists.");
}

export function invalidCredentials() {
  return new HttpError(401, "invalid_credentials", "Email or password is wrong.");
}
