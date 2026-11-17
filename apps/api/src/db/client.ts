import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateSqlite, schemaVersion } from "./migrate";

const DEFAULT_SQLITE_PATH = "data/game.db";

export type AppDatabase = DatabaseSync;

export function resolveSqlitePath(databaseUrl?: string) {
  if (!databaseUrl || databaseUrl.startsWith("postgres")) {
    return resolve(process.cwd(), DEFAULT_SQLITE_PATH);
  }

  const filePath = databaseUrl.replace(/^file:/, "");
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

/**
 * Opens the SQLite file and migrates it. `migrationsApplied` lists the schema
 * versions this call ran, empty when the file was already current.
 */
export function createDatabase(databaseUrl?: string) {
  const filePath = resolveSqlitePath(databaseUrl);
  mkdirSync(dirname(filePath), { recursive: true });

  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  const migrationsApplied = migrateSqlite(db);
  return { db, migrationsApplied, schemaVersion: schemaVersion(db) };
}

const depth = new WeakMap<AppDatabase, number>();

/**
 * Runs `work` atomically. Calls can nest: the outermost is a real
 * transaction and inner ones are savepoints, so a helper that guards itself
 * with a transaction (a refund, say) can also be one step of a bigger
 * all-or-nothing change. If an inner step throws, only it is undone and the
 * error carries on up; if nothing catches it, the whole outer change rolls
 * back.
 */
export function withTransaction<T>(db: AppDatabase, work: () => T) {
  const level = depth.get(db) ?? 0;
  const savepoint = `sp_${level}`;
  db.exec(level === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
  depth.set(db, level + 1);
  try {
    const result = work();
    db.exec(level === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    db.exec(level === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw error;
  } finally {
    depth.set(db, level);
  }
}
