/**
 * Admin tool: give or take away admin rights. Admins see the withdrawal list
 * at /admin and can mark requests paid or rejected.
 *
 *   pnpm --filter @game-platform/api admin -- "<display name>" on
 *   pnpm --filter @game-platform/api admin -- "<display name>" off
 *   pnpm --filter @game-platform/api admin            (lists the admins)
 *
 * This is the only way to make an admin: there is no API for it. It reads the
 * same `.env` as the server. The change applies on the player's next page load.
 */
import { createDatabase } from "../db/client";

const [name, setting] = process.argv.slice(2).filter((arg) => arg !== "--");
const { db } = createDatabase(process.env.DATABASE_URL);

if (name) {
  if (setting !== "on" && setting !== "off") {
    console.error('Usage: admin -- "<display name>" on|off');
    process.exit(1);
  }
  const updated = db.prepare("UPDATE users SET is_admin = ? WHERE name = ?").run(setting === "on" ? 1 : 0, name);
  if (Number(updated.changes) !== 1) {
    console.error(`No player is called "${name}".`);
    process.exit(1);
  }
  console.log(`${name} is ${setting === "on" ? "now an admin" : "no longer an admin"}.`);
}

const admins = db.prepare("SELECT name FROM users WHERE is_admin = 1 ORDER BY name").all() as { name: string }[];
console.log(admins.length ? `Admins: ${admins.map((admin) => admin.name).join(", ")}` : "There are no admins.");
db.close();
