import { DEFAULT_SITE_SETTINGS, siteSettingsSchema, type SiteSettings } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { recordAudit } from "./audit";

/**
 * The site switches. Read from the database on every check, so a change
 * takes effect at once in every part of the server, with no restart and no
 * cache to go stale.
 */
export function readSiteSettings(db: AppDatabase): SiteSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'site'").get() as { value: string } | undefined;
  if (!row) return DEFAULT_SITE_SETTINGS;
  // Merge over the defaults, so a switch added later starts in its safe default.
  const parsed = siteSettingsSchema.safeParse({ ...DEFAULT_SITE_SETTINGS, ...(JSON.parse(row.value) as object) });
  return parsed.success ? parsed.data : DEFAULT_SITE_SETTINGS;
}

/** Saves new settings and audits exactly what changed. */
export function writeSiteSettings(
  db: AppDatabase,
  actor: { userId: string; ip?: string | null },
  next: SiteSettings,
  now = new Date(),
) {
  const before = readSiteSettings(db);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(next) as (keyof SiteSettings)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(next[key])) changes[key] = { from: before[key], to: next[key] };
  }
  if (Object.keys(changes).length === 0) return before;

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('site', ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(next), actor.userId, now.toISOString());
    recordAudit(db, { adminId: actor.userId, action: "site.settings_changed", details: changes, ip: actor.ip });
  });
  return next;
}
