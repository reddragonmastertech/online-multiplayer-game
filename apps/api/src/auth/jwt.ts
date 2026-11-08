import { createHmac, timingSafeEqual } from "node:crypto";
import { displayNameSchema, emailSchema, userIdSchema } from "@game-platform/shared";
import { z } from "zod";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const accessTokenPayloadSchema = z.object({
  sub: userIdSchema,
  name: displayNameSchema,
  email: emailSchema,
  iat: z.number().int(),
  exp: z.number().int(),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function sign(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signAccessToken(
  payload: Pick<AccessTokenPayload, "sub" | "name" | "email">,
  secret: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = encode(JSON.stringify(body));
  const unsigned = `${header}.${claims}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const [header, claims, signature] = token.split(".");
  if (!header || !claims || !signature) {
    throw new Error("invalid_token");
  }

  const unsigned = `${header}.${claims}`;
  if (!signaturesMatch(sign(unsigned, secret), signature)) {
    throw new Error("invalid_token");
  }

  const parsed = accessTokenPayloadSchema.safeParse(
    JSON.parse(Buffer.from(claims, "base64url").toString("utf8")),
  );

  if (!parsed.success || parsed.data.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("invalid_token");
  }

  return parsed.data;
}

export function readBearerToken(header: string | undefined) {
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }

  return token;
}
