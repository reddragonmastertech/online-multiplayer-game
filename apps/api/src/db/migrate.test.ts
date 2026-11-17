import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { assertMigrationOrder, migrateSqlite, migrations, schemaVersion, type Migration } from "./migrate";

const TABLES = [
  "users",
  "wallets",
  "ledger_entries",
  "matches",
  "match_players",
  "match_rounds",
  "house_ledger",
  "deposit_wallets",
  "deposits",
  "withdrawals",
  "admin_audit",
  "admin_notes",
  "deposit_attempts",
  "house_sweeps",
  "backups",
  "settings",
];

function tableNames(db: DatabaseSync) {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

function columnNames(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe("migrateSqlite", () => {
  it("brings a fresh database to the latest version", () => {
    const db = new DatabaseSync(":memory:");

    expect(migrateSqlite(db)).toEqual(migrations.map((m) => m.version));
    expect(schemaVersion(db)).toBe(migrations.length);
    expect(tableNames(db)).toEqual([...TABLES].sort());
  });

  it("does nothing the second time", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite(db);

    expect(migrateSqlite(db)).toEqual([]);
    expect(schemaVersion(db)).toBe(migrations.length);
  });

  it("adopts a database made by the old unversioned migrator, keeping its rows", () => {
    // What every game.db in the wild looks like today: tables present,
    // user_version never set.
    const db = new DatabaseSync(":memory:");
    for (const statement of migrations[0]!.statements) {
      db.exec(statement);
    }
    db.exec(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ('u1', 'ada', 'a@x', 'h', 'now')",
    );
    expect(schemaVersion(db)).toBe(0);

    migrateSqlite(db);

    expect(schemaVersion(db)).toBe(migrations.length);
    expect(db.prepare("SELECT name FROM users").all()).toEqual([{ name: "ada" }]);
  });

  it("gives every existing account a USDT wallet at 0 and leaves RAC alone", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite(db, migrations.slice(0, 1));
    db.exec(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ('u1', 'ada', 'a@x', 'h', 'now')",
    );
    db.exec("INSERT INTO wallets (user_id, currency, available, locked) VALUES ('u1', 'rac', 97, 3)");

    expect(migrateSqlite(db, migrations.slice(0, 2))).toEqual([2]);

    expect(
      db.prepare("SELECT currency, available, locked FROM wallets WHERE user_id = 'u1' ORDER BY currency").all(),
    ).toEqual([
      { currency: "rac", available: 97, locked: 3 },
      { currency: "usdt", available: 0, locked: 0 },
    ]);
  });

  it("applies only the migrations above the current version", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite(db);
    db.exec(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ('u1', 'ada', 'a@x', 'h', 'now')",
    );

    const next: Migration = {
      version: migrations.length + 1,
      name: "add a column",
      statements: ["ALTER TABLE users ADD COLUMN slogan TEXT"],
    };

    expect(migrateSqlite(db, [...migrations, next])).toEqual([next.version]);
    expect(columnNames(db, "users")).toContain("slogan");
    expect(db.prepare("SELECT name, slogan FROM users").all()).toEqual([{ name: "ada", slogan: null }]);
  });

  it("rolls back a failed migration and leaves the version where it was", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite(db);
    const before = schemaVersion(db);

    const broken: Migration = {
      version: migrations.length + 1,
      name: "half applies, then fails",
      statements: ["ALTER TABLE users ADD COLUMN slogan TEXT", "THIS IS NOT SQL"],
    };

    expect(() => migrateSqlite(db, [...migrations, broken])).toThrow(/half applies, then fails/);
    expect(schemaVersion(db)).toBe(before);
    expect(columnNames(db, "users")).not.toContain("slogan");
  });

  it("refuses a database migrated by a newer build", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite(db);
    db.exec(`PRAGMA user_version = ${migrations.length + 1}`);

    expect(() => migrateSqlite(db)).toThrow(/only knows up to/);
  });
});

describe("assertMigrationOrder", () => {
  it("accepts the shipped list", () => {
    expect(() => assertMigrationOrder(migrations)).not.toThrow();
  });

  it("rejects a gap or a repeat", () => {
    const one = { version: 1, name: "one", statements: [] };
    expect(() => assertMigrationOrder([one, { version: 3, name: "three", statements: [] }])).toThrow(
      /expected 2/,
    );
    expect(() => assertMigrationOrder([one, { ...one, name: "again" }])).toThrow(/expected 2/);
  });
});
