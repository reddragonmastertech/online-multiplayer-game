import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateSqlite } from "./migrate";

const DEFAULT_SQLITE_PATH = "data/game.db";

export type AppDatabase = DatabaseSync;

export function resolveSqlitePath(databaseUrl?: string) {
  if (!databaseUrl || databaseUrl.startsWith("postgres")) {
    return resolve(process.cwd(), DEFAULT_SQLITE_PATH);
  }

  const filePath = databaseUrl.replace(/^file:/, "");
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

export function createDatabase(databaseUrl?: string) {
  const filePath = resolveSqlitePath(databaseUrl);
  mkdirSync(dirname(filePath), { recursive: true });

  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrateSqlite(db);
  return db;
}

export function withTransaction<T>(db: AppDatabase, work: () => T) {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
