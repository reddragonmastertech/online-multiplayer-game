import { integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    unique("users_name_unique").on(table.name),
  ],
);

export const wallets = sqliteTable(
  "wallets",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    currency: text("currency").notNull(),
    available: integer("available").notNull(),
    locked: integer("locked").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.currency] })],
);

export const ledgerEntries = sqliteTable("ledger_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  currency: text("currency").notNull(),
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
  matchId: text("match_id"),
  createdAt: text("created_at").notNull(),
});

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  mode: text("mode").notNull(),
  currency: text("currency").notNull(),
  stake: integer("stake").notNull(),
  status: text("status").notNull(),
  round: integer("round").notNull(),
  winnerSeat: text("winner_seat"),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
});

export const matchPlayers = sqliteTable(
  "match_players",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    seat: text("seat").notNull(),
    score: integer("score").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.userId] })],
);

export const matchRounds = sqliteTable(
  "match_rounds",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id),
    round: integer("round").notNull(),
    handA: text("hand_a"),
    handB: text("hand_b"),
    outcome: text("outcome"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.round] })],
);
