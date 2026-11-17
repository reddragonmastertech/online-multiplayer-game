/**
 * Admin tool: give, change or take away an admin role from the server's
 * command line. Use it to make the first owner; after that the owner can
 * manage admins in the browser at /admin/admins.
 *
 *   pnpm --filter @game-platform/api admin -- "<display name>" owner
 *   pnpm --filter @game-platform/api admin -- "<display name>" finance|moderator|support
 *   pnpm --filter @game-platform/api admin -- "<display name>" off
 *   pnpm --filter @game-platform/api admin -- "<display name>" reset-2fa   (lost phone)
 *   pnpm --filter @game-platform/api admin                     (lists the admins)
 *
 * `on` still works and means owner. A new admin sets up two-factor the first
 * time they open /admin. It reads the same `.env` as the server.
 */
import { adminRoleSchema } from "@game-platform/shared";
import { createDatabase } from "../db/client";

const [name, setting] = process.argv.slice(2).filter((arg) => arg !== "--");
const { db } = createDatabase(process.env.DATABASE_URL);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (name) {
  if (setting === "reset-2fa") {
    const reset = db
      .prepare(
        `UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, token_version = token_version + 1
         WHERE name = ? AND role IS NOT NULL`,
      )
      .run(name);
    if (Number(reset.changes) !== 1) fail(`No admin is called "${name}".`);
    console.log(`Two-factor reset for ${name}. They set it up again on their next visit to /admin.`);
    db.close();
    process.exit(0);
  }

  const role = setting === "on" ? "owner" : setting === "off" ? null : adminRoleSchema.safeParse(setting).data;
  if (role === undefined) fail('Usage: admin -- "<display name>" owner|finance|moderator|support|off|reset-2fa');

  if (role !== "owner") {
    const owners = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND name != ?").get(name) as { n: number };
    const isOwner = db.prepare("SELECT 1 FROM users WHERE role = 'owner' AND name = ?").get(name);
    if (isOwner && owners.n === 0) fail("Refused: there must always be at least one owner.");
  }

  // Any change ends the person's sessions; removing a role also clears two-factor.
  const updated = db
    .prepare(
      `UPDATE users SET role = ?, token_version = token_version + 1,
         totp_enabled = CASE WHEN ? IS NULL THEN 0 ELSE totp_enabled END,
         totp_secret = CASE WHEN ? IS NULL THEN NULL ELSE totp_secret END
       WHERE name = ?`,
    )
    .run(role, role, role, name);
  if (Number(updated.changes) !== 1) fail(`No player is called "${name}".`);
  console.log(role ? `${name} is now ${role}.` : `${name} is no longer an admin.`);
}

const admins = db.prepare("SELECT name, role, totp_enabled FROM users WHERE role IS NOT NULL ORDER BY name").all() as {
  name: string;
  role: string;
  totp_enabled: number;
}[];
console.log(
  admins.length
    ? `Admins: ${admins.map((admin) => `${admin.name} (${admin.role}${admin.totp_enabled ? "" : ", two-factor not set up"})`).join(", ")}`
    : "There are no admins.",
);
db.close();
