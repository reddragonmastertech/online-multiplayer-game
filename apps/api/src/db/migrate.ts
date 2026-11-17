/**
 * Versioned schema migrations.
 *
 * The database records how far it has migrated in SQLite's `user_version`
 * header field. On open, every migration above that number runs once, in
 * order, each in its own transaction together with the version bump, so a
 * failed migration leaves both the schema and the version where they were.
 *
 * Rules for changing the schema:
 *
 * - Never edit a migration that has shipped. Databases already past it will
 *   not run it again, so the edit would only reach fresh files.
 * - Add a new entry with the next version number instead.
 * - Keep `schema.ts` (the Drizzle types) in step with the result.
 */

type SqliteClient = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => { get: () => unknown };
};

export type Migration = {
  version: number;
  name: string;
  statements: readonly string[];
};

export const migrations: readonly Migration[] = [
  {
    // The schema as it stood before migrations were versioned. Everything is
    // `IF NOT EXISTS`, so a database created by the old unversioned code
    // (user_version 0, tables present) adopts this as a no-op.
    version: 1,
    name: "initial schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users (name)`,
      `CREATE TABLE IF NOT EXISTS wallets (
        user_id TEXT NOT NULL REFERENCES users (id),
        currency TEXT NOT NULL,
        available INTEGER NOT NULL,
        locked INTEGER NOT NULL,
        PRIMARY KEY (user_id, currency)
      )`,
      `CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id),
        currency TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        match_id TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        currency TEXT NOT NULL,
        stake INTEGER NOT NULL,
        status TEXT NOT NULL,
        round INTEGER NOT NULL,
        winner_seat TEXT,
        created_at TEXT NOT NULL,
        finished_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches (id),
        user_id TEXT NOT NULL REFERENCES users (id),
        seat TEXT NOT NULL,
        score INTEGER NOT NULL,
        PRIMARY KEY (match_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS match_rounds (
        match_id TEXT NOT NULL REFERENCES matches (id),
        round INTEGER NOT NULL,
        hand_a TEXT,
        hand_b TEXT,
        outcome TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (match_id, round)
      )`,
    ],
  },
  {
    // The paid version. Every existing account gets a USDT wallet at 0, and
    // the house's cut of USDT matches gets its own ledger. RAC is untouched.
    version: 2,
    name: "usdt wallets and house ledger",
    statements: [
      `INSERT INTO wallets (user_id, currency, available, locked)
       SELECT id, 'usdt', 0, 0 FROM users
       WHERE NOT EXISTS (
         SELECT 1 FROM wallets WHERE wallets.user_id = users.id AND wallets.currency = 'usdt'
       )`,
      `CREATE TABLE house_ledger (
        id TEXT PRIMARY KEY,
        currency TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        match_id TEXT REFERENCES matches (id),
        created_at TEXT NOT NULL
      )`,
    ],
  },
  {
    // USDT deposits. `deposit_wallets` is the wallet each player pays from;
    // an address belongs to one account only. `deposits` holds every credited
    // transaction, and UNIQUE (network, tx_id) is what makes a double credit
    // impossible, even if two claims race.
    version: 3,
    name: "usdt deposits",
    statements: [
      `CREATE TABLE deposit_wallets (
        user_id TEXT NOT NULL REFERENCES users (id),
        network TEXT NOT NULL,
        address TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, network)
      )`,
      `CREATE UNIQUE INDEX deposit_wallets_address_unique ON deposit_wallets (network, address)`,
      `CREATE TABLE deposits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id),
        network TEXT NOT NULL,
        tx_id TEXT NOT NULL,
        from_address TEXT NOT NULL,
        amount INTEGER NOT NULL,
        fee INTEGER NOT NULL,
        credited INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX deposits_tx_unique ON deposits (network, tx_id)`,
      `CREATE INDEX deposits_user ON deposits (user_id, created_at)`,
    ],
  },
  {
    // USDT withdrawals, approved by hand. `is_admin` is set from the command
    // line only. A payout transaction can settle one request only.
    version: 4,
    name: "usdt withdrawals",
    statements: [
      `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`,
      `CREATE TABLE withdrawals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id),
        network TEXT NOT NULL,
        address TEXT NOT NULL,
        amount INTEGER NOT NULL,
        fee INTEGER NOT NULL,
        payout INTEGER NOT NULL,
        status TEXT NOT NULL,
        payout_tx_id TEXT,
        note TEXT,
        decided_by TEXT REFERENCES users (id),
        created_at TEXT NOT NULL,
        decided_at TEXT
      )`,
      `CREATE INDEX withdrawals_user ON withdrawals (user_id, created_at)`,
      `CREATE INDEX withdrawals_status ON withdrawals (status, created_at)`,
      `CREATE UNIQUE INDEX withdrawals_payout_tx_unique ON withdrawals (network, payout_tx_id)
       WHERE payout_tx_id IS NOT NULL`,
    ],
  },
  {
    // The admin area. `role` replaces `is_admin` (existing admins become
    // owners). `token_version` ends every session when it goes up. The TOTP
    // columns hold each admin's two-factor secret and the last time step
    // used, so a code cannot be replayed. The audit log is append-only.
    version: 5,
    name: "admin roles, two-factor and audit log",
    statements: [
      `ALTER TABLE users ADD COLUMN role TEXT`,
      `UPDATE users SET role = 'owner' WHERE is_admin = 1`,
      `ALTER TABLE users DROP COLUMN is_admin`,
      `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE users ADD COLUMN usdt_frozen INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN totp_secret TEXT`,
      `ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN totp_last_step INTEGER`,
      `ALTER TABLE users ADD COLUMN last_seen_at TEXT`,
      `CREATE TABLE admin_audit (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES users (id),
        action TEXT NOT NULL,
        target_user_id TEXT REFERENCES users (id),
        details TEXT NOT NULL,
        ip TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX admin_audit_time ON admin_audit (created_at)`,
      `CREATE INDEX admin_audit_target ON admin_audit (target_user_id, created_at)`,
      `CREATE TABLE admin_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id),
        admin_id TEXT NOT NULL REFERENCES users (id),
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX admin_notes_user ON admin_notes (user_id, created_at)`,
    ],
  },
  {
    // Money safety. A withdrawal can be claimed by one admin while they send
    // it. Failed deposit claims are kept for support. Sweeps record house
    // earnings taken out, so the books still balance. Backups are listed so
    // the dashboard can show the last one. `manual` marks deposits an admin
    // credited by hand.
    version: 6,
    name: "withdrawal claims, deposit attempts, sweeps and backups",
    statements: [
      `ALTER TABLE withdrawals ADD COLUMN claimed_by TEXT REFERENCES users (id)`,
      `ALTER TABLE withdrawals ADD COLUMN claimed_at TEXT`,
      `ALTER TABLE deposits ADD COLUMN manual_by TEXT REFERENCES users (id)`,
      `CREATE TABLE deposit_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users (id),
        network TEXT NOT NULL,
        tx_id TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX deposit_attempts_user ON deposit_attempts (user_id, created_at)`,
      `CREATE INDEX deposit_attempts_time ON deposit_attempts (created_at)`,
      `CREATE TABLE house_sweeps (
        id TEXT PRIMARY KEY,
        currency TEXT NOT NULL,
        amount INTEGER NOT NULL,
        note TEXT NOT NULL,
        admin_id TEXT NOT NULL REFERENCES users (id),
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE backups (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        size INTEGER NOT NULL,
        admin_id TEXT REFERENCES users (id),
        created_at TEXT NOT NULL
      )`,
    ],
  },
];

export function schemaVersion(client: SqliteClient) {
  const row = client.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

/** Checks the list is 1, 2, 3, … with no gaps or repeats. */
export function assertMigrationOrder(list: readonly Migration[]) {
  list.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration "${migration.name}" has version ${migration.version}; expected ${index + 1}.`,
      );
    }
  });
}

/**
 * Brings the database up to the latest version. Returns the versions applied,
 * which is empty when it was already current.
 */
export function migrateSqlite(client: SqliteClient, list: readonly Migration[] = migrations) {
  assertMigrationOrder(list);

  const current = schemaVersion(client);
  const latest = list.length;
  if (current > latest) {
    // An older build opened a file a newer build has already migrated.
    // Running on would mean reading columns this code does not know about.
    throw new Error(
      `Database schema is version ${current}, but this build only knows up to ${latest}. ` +
        "Deploy the newer build, or restore a backup made before it.",
    );
  }

  const applied: number[] = [];
  for (const migration of list.slice(current)) {
    client.exec("BEGIN");
    try {
      for (const statement of migration.statements) {
        client.exec(statement);
      }
      // PRAGMA cannot take a bound parameter; the version is an integer we own.
      client.exec(`PRAGMA user_version = ${migration.version}`);
      client.exec("COMMIT");
    } catch (error) {
      client.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.version} ("${migration.name}") failed: ${(error as Error).message}`,
        { cause: error },
      );
    }
    applied.push(migration.version);
  }
  return applied;
}
