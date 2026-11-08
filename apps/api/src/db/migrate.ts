type SqliteExecClient = {
  exec: (sql: string) => unknown;
};

const statements = [
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
];

export function migrateSqlite(client: SqliteExecClient) {
  client.exec("BEGIN");
  try {
    for (const statement of statements) {
      client.exec(statement);
    }
    client.exec("COMMIT");
  } catch (error) {
    client.exec("ROLLBACK");
    throw error;
  }
}
