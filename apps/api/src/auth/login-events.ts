import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client";

/**
 * Records where an account signed in from. Used only by admins, to spot one
 * person running several accounts. Behind a tunnel or proxy this is the real
 * client address when TRUST_PROXY is on.
 */
export function recordLogin(
  db: AppDatabase,
  entry: { userId: string; kind: "signup" | "login"; ip: string; userAgent?: string | string[] },
) {
  const agent = Array.isArray(entry.userAgent) ? entry.userAgent[0] : entry.userAgent;
  db.prepare("INSERT INTO login_events (id, user_id, kind, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    entry.userId,
    entry.kind,
    entry.ip,
    agent ? agent.slice(0, 300) : null,
    new Date().toISOString(),
  );
}
