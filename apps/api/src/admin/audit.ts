import { randomUUID } from "node:crypto";
import type { AdminAuditEntry } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";

/**
 * The admin audit log. Append-only: nothing in the app updates or deletes a
 * row. Write it inside the same transaction as the change it records, so a
 * change without its audit row cannot happen.
 */
export function recordAudit(
  db: AppDatabase,
  entry: {
    adminId: string;
    action: string;
    targetUserId?: string | null;
    details?: Record<string, unknown>;
    ip?: string | null;
    now?: string;
  },
) {
  db.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    randomUUID(),
    entry.adminId,
    entry.action,
    entry.targetUserId ?? null,
    JSON.stringify(entry.details ?? {}),
    entry.ip ?? null,
    entry.now ?? new Date().toISOString(),
  );
}

type AuditRow = {
  id: string;
  admin_name: string;
  action: string;
  target_user_id: string | null;
  target_name: string | null;
  details: string;
  ip: string | null;
  created_at: string;
};

export function readAudit(db: AppDatabase, filter: { targetUserId?: string; limit?: number } = {}): AdminAuditEntry[] {
  const where = filter.targetUserId ? "WHERE a.target_user_id = ?" : "";
  const params = filter.targetUserId ? [filter.targetUserId] : [];
  const rows = db
    .prepare(
      `SELECT a.id, admin.name AS admin_name, a.action, a.target_user_id, target.name AS target_name,
              a.details, a.ip, a.created_at
       FROM admin_audit a
       JOIN users admin ON admin.id = a.admin_id
       LEFT JOIN users target ON target.id = a.target_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .all(...params, filter.limit ?? 200) as AuditRow[];

  return rows.map((row) => ({
    id: row.id,
    adminName: row.admin_name,
    action: row.action,
    targetUserId: row.target_user_id,
    targetName: row.target_name,
    details: JSON.parse(row.details) as Record<string, unknown>,
    ip: row.ip,
    createdAt: row.created_at,
  }));
}
