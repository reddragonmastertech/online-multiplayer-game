import { randomBytes, randomUUID } from "node:crypto";
import {
  NETWORK_INFO,
  ROLE_INFO,
  formatAmount,
  type AdminAlert,
  type AdminDashboard,
  type AdminPlayerDetail,
  type AdminPlayerSummary,
  type AdminRole,
  type AdminSession,
  type AdminTotpSetup,
  type Currency,
  type DepositNetwork,
  type DepositRecord,
  type WithdrawalRecord,
} from "@game-platform/shared";
import { ADMIN_TOKEN_TTL_SECONDS, signAccessToken } from "../auth/jwt";
import { hashPassword } from "../auth/password";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { adjustBalance, readWallets } from "../economy/wallet";
import { HttpError, invalidInput, notFound } from "../http/errors";
import { loadMatchHistory } from "../match/history";
import { readAudit, recordAudit } from "./audit";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";

export type AdminActor = { userId: string; name: string; role: AdminRole; ip?: string | null };

/** What the admin area needs to know about live play. */
export type LiveView = {
  onlineCount: () => number;
  liveMatches: () => number;
  queueWaiting: () => number;
  disconnectUser: (userId: string) => void;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: AdminRole | null;
  status: "active" | "suspended";
  usdt_frozen: number;
  created_at: string;
  last_seen_at: string | null;
  totp_enabled: number;
  totp_secret: string | null;
  totp_last_step: number | null;
  token_version: number;
};

const SUMMARY_COLUMNS = `u.id, u.name, u.email, u.role, u.status, u.usdt_frozen, u.created_at, u.last_seen_at,
  COALESCE((SELECT available + locked FROM wallets WHERE user_id = u.id AND currency = 'rac'), 0) AS rac,
  COALESCE((SELECT available + locked FROM wallets WHERE user_id = u.id AND currency = 'usdt'), 0) AS usdt`;

type SummaryRow = Omit<UserRow, "totp_enabled" | "totp_secret" | "totp_last_step" | "token_version"> & {
  rac: number;
  usdt: number;
};

function toSummary(row: SummaryRow): AdminPlayerSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    usdtFrozen: row.usdt_frozen === 1,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    rac: row.rac,
    usdt: row.usdt,
  };
}

const HOUSE_KINDS = ["match_cut", "deposit_fee", "withdrawal_fee"] as const;

/** 12 characters from an alphabet without look-alikes (no 0/O, 1/l/I). */
function temporaryPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(12)].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export function createAdminService(deps: { db: AppDatabase; jwtSecret: string; live: LiveView; now?: () => Date }) {
  const { db, jwtSecret, live } = deps;
  const now = deps.now ?? (() => new Date());

  function user(userId: string) {
    const row = db
      .prepare(
        `SELECT id, name, email, role, status, usdt_frozen, created_at, last_seen_at, totp_enabled, totp_secret,
                totp_last_step, token_version
         FROM users WHERE id = ?`,
      )
      .get(userId) as UserRow | undefined;
    if (!row) throw notFound("That player does not exist.");
    return row;
  }

  /* ---------- Two-factor and admin sessions ---------- */

  function issueSession(row: UserRow): AdminSession {
    if (!row.role) throw new HttpError(403, "forbidden", "Only an admin can do that.");
    const token = signAccessToken(
      { sub: row.id, name: row.name, email: row.email, tv: row.token_version, scope: "admin" },
      jwtSecret,
      ADMIN_TOKEN_TTL_SECONDS,
    );
    return {
      token,
      role: row.role,
      expiresAt: new Date(now().getTime() + ADMIN_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** Starts (or restarts) two-factor setup for an admin who has not finished it. */
  function setupTotp(userId: string): AdminTotpSetup {
    const row = user(userId);
    if (row.totp_enabled === 1) {
      throw invalidInput("Two-factor is already set up. Ask the owner to reset it if you lost your device.");
    }
    const secret = generateTotpSecret();
    db.prepare("UPDATE users SET totp_secret = ?, totp_last_step = NULL WHERE id = ?").run(secret, userId);
    return { secret, uri: totpUri(secret, row.email) };
  }

  function checkCode(row: UserRow, code: string) {
    if (!row.totp_secret) return undefined;
    return verifyTotp(row.totp_secret, code, now().getTime(), row.totp_last_step);
  }

  /** Finishes setup with the first code from the app, and opens a session. */
  function enableTotp(userId: string, code: string, ip?: string | null): AdminSession {
    const row = user(userId);
    if (row.totp_enabled === 1) throw invalidInput("Two-factor is already set up.");
    const step = checkCode(row, code);
    if (step === undefined) throw invalidInput("That code is not right. Check the time on your phone and try again.");

    withTransaction(db, () => {
      db.prepare("UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?").run(step, userId);
      recordAudit(db, { adminId: userId, action: "admin.two_factor_enabled", targetUserId: userId, ip });
    });
    return issueSession({ ...row, totp_enabled: 1 });
  }

  /** Opens an admin session with a fresh code. Each code works once. */
  function startSession(userId: string, code: string, ip?: string | null): AdminSession {
    const row = user(userId);
    if (row.totp_enabled !== 1) {
      throw new HttpError(403, "two_factor_required", "Set up two-factor first.");
    }
    const step = checkCode(row, code);
    if (step === undefined) {
      recordAudit(db, { adminId: userId, action: "admin.login_failed", targetUserId: userId, ip });
      throw invalidInput("That code is not right, or it was already used. Wait for the next one.");
    }
    withTransaction(db, () => {
      db.prepare("UPDATE users SET totp_last_step = ? WHERE id = ?").run(step, userId);
      recordAudit(db, { adminId: userId, action: "admin.login", targetUserId: userId, ip });
    });
    return issueSession(row);
  }

  /* ---------- Dashboard ---------- */

  function dashboard(): AdminDashboard {
    const at = now();
    const today = `${at.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const week = new Date(at.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const dayAgo = new Date(at.getTime() - 24 * 3600 * 1000).toISOString();
    const one = <T>(sql: string, ...params: (string | number)[]) => db.prepare(sql).get(...params) as T;

    const players = one<{ total: number; new_today: number; new_week: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_today,
              SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_week
       FROM users`,
      today,
      week,
    );

    const matchesToday = db
      .prepare(
        `SELECT currency, COUNT(*) AS count, COALESCE(SUM(stake * 2), 0) AS volume
         FROM matches WHERE status IN ('finished', 'forfeited') AND finished_at >= ?
         GROUP BY currency`,
      )
      .all(today) as { currency: Currency; count: number; volume: number }[];

    const usdtHeld = one<{ available: number; locked: number }>(
      "SELECT COALESCE(SUM(available), 0) AS available, COALESCE(SUM(locked), 0) AS locked FROM wallets WHERE currency = 'usdt'",
    );
    const depositsToday = one<{ count: number; amount: number }>(
      "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM deposits WHERE created_at >= ?",
      today,
    );
    const waiting = one<{ count: number; amount: number; stale: number }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount,
              SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS stale
       FROM withdrawals WHERE status = 'pending'`,
      dayAgo,
    );
    const paidToday = one<{ count: number; payout: number }>(
      "SELECT COUNT(*) AS count, COALESCE(SUM(payout), 0) AS payout FROM withdrawals WHERE status = 'paid' AND decided_at >= ?",
      today,
    );
    const house = HOUSE_KINDS.map((kind) => {
      const row = one<{ today: number; week: number; total: number }>(
        `SELECT COALESCE(SUM(CASE WHEN created_at >= ? THEN amount END), 0) AS today,
                COALESCE(SUM(CASE WHEN created_at >= ? THEN amount END), 0) AS week,
                COALESCE(SUM(amount), 0) AS total
         FROM house_ledger WHERE currency = 'usdt' AND kind = ?`,
        today,
        week,
        kind,
      );
      return { kind, ...row };
    });

    const alerts: AdminAlert[] = [];
    if (waiting.stale > 0) {
      alerts.push({ level: "warning", message: `${waiting.stale} withdrawal(s) have waited more than 24 hours.` });
    }
    for (const currency of ["rac", "usdt"] as const) {
      const books = one<{ ledger: number; wallets: number }>(
        `SELECT (SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE currency = ?) AS ledger,
                (SELECT COALESCE(SUM(available), 0) FROM wallets WHERE currency = ?) AS wallets`,
        currency,
        currency,
      );
      if (books.ledger !== books.wallets) {
        alerts.push({
          level: "error",
          message: `The ${currency.toUpperCase()} ledger (${formatAmount(currency, books.ledger)}) does not match the balances (${formatAmount(currency, books.wallets)}).`,
        });
      }
    }
    const unsettled = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM matches m
       WHERE m.status IN ('finished', 'forfeited')
         AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.match_id = m.id AND l.kind = 'payout')`,
    );
    if (unsettled.n > 0) {
      alerts.push({ level: "error", message: `${unsettled.n} finished match(es) have no payout. Settlement failed.` });
    }

    return {
      players: {
        total: players.total,
        newToday: players.new_today ?? 0,
        newWeek: players.new_week ?? 0,
        onlineNow: live.onlineCount(),
      },
      matches: { live: live.liveMatches(), queueWaiting: live.queueWaiting(), today: matchesToday },
      money: {
        usdtHeld,
        depositsToday,
        withdrawalsWaiting: { count: waiting.count, amount: waiting.amount },
        withdrawalsPaidToday: paidToday,
        house,
      },
      alerts,
      generatedAt: at.toISOString(),
    };
  }

  /* ---------- Players ---------- */

  /**
   * Finds players by name, email, ID, a saved wallet address, a deposit TxID
   * or a withdrawal's address or payout TxID. An empty query lists the newest.
   */
  function searchPlayers(query: string): AdminPlayerSummary[] {
    const q = query.trim();
    if (!q) {
      const rows = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM users u ORDER BY u.created_at DESC LIMIT 50`).all() as SummaryRow[];
      return rows.map(toSummary);
    }
    const like = `%${q.replace(/[%_]/g, (char) => `\\${char}`)}%`;
    const rows = db
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM users u
         WHERE u.id = ?
            OR u.name LIKE ? ESCAPE '\\'
            OR u.email LIKE ? ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM deposit_wallets dw WHERE dw.user_id = u.id AND lower(dw.address) = lower(?))
            OR EXISTS (SELECT 1 FROM deposits d WHERE d.user_id = u.id AND (d.tx_id = lower(?) OR lower(d.from_address) = lower(?)))
            OR EXISTS (SELECT 1 FROM withdrawals w WHERE w.user_id = u.id AND (w.payout_tx_id = lower(?) OR lower(w.address) = lower(?)))
         ORDER BY u.created_at DESC
         LIMIT 50`,
      )
      .all(q, like, like, q, q, q, q, q) as SummaryRow[];
    return rows.map(toSummary);
  }

  function playerDetail(userId: string): AdminPlayerDetail {
    const row = user(userId);
    const summary = toSummary(
      db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM users u WHERE u.id = ?`).get(userId) as SummaryRow,
    );

    const deposits = (
      db
        .prepare(
          `SELECT id, network, tx_id, from_address, amount, fee, credited, created_at
           FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        )
        .all(userId) as {
        id: string;
        network: DepositNetwork;
        tx_id: string;
        from_address: string;
        amount: number;
        fee: number;
        credited: number;
        created_at: string;
      }[]
    ).map(
      (d): DepositRecord => ({
        id: d.id,
        network: d.network,
        txId: d.tx_id,
        fromAddress: d.from_address,
        amount: d.amount,
        fee: d.fee,
        credited: d.credited,
        createdAt: d.created_at,
      }),
    );

    const withdrawals = (
      db
        .prepare(
          `SELECT id, network, address, amount, fee, payout, status, payout_tx_id, note, created_at, decided_at
           FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        )
        .all(userId) as {
        id: string;
        network: DepositNetwork;
        address: string;
        amount: number;
        fee: number;
        payout: number;
        status: WithdrawalRecord["status"];
        payout_tx_id: string | null;
        note: string | null;
        created_at: string;
        decided_at: string | null;
      }[]
    ).map(
      (w): WithdrawalRecord => ({
        id: w.id,
        network: w.network,
        address: w.address,
        amount: w.amount,
        fee: w.fee,
        payout: w.payout,
        status: w.status,
        payoutTxId: w.payout_tx_id,
        note: w.note,
        createdAt: w.created_at,
        decidedAt: w.decided_at,
      }),
    );

    const ledger = (
      db
        .prepare(
          `SELECT id, currency, kind, amount, match_id, created_at FROM ledger_entries
           WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200`,
        )
        .all(userId) as {
        id: string;
        currency: Currency;
        kind: string;
        amount: number;
        match_id: string | null;
        created_at: string;
      }[]
    ).map((entry) => ({
      id: entry.id,
      currency: entry.currency,
      kind: entry.kind,
      amount: entry.amount,
      matchId: entry.match_id,
      createdAt: entry.created_at,
    }));

    const notes = (
      db
        .prepare(
          `SELECT n.id, a.name AS admin_name, n.text, n.created_at FROM admin_notes n
           JOIN users a ON a.id = n.admin_id WHERE n.user_id = ? ORDER BY n.created_at DESC`,
        )
        .all(userId) as { id: string; admin_name: string; text: string; created_at: string }[]
    ).map((note) => ({ id: note.id, adminName: note.admin_name, text: note.text, createdAt: note.created_at }));

    return {
      ...summary,
      totpEnabled: row.totp_enabled === 1,
      wallets: readWallets(db, userId),
      savedWallets: db
        .prepare("SELECT network, address FROM deposit_wallets WHERE user_id = ? ORDER BY network")
        .all(userId) as { network: DepositNetwork; address: string }[],
      deposits,
      withdrawals,
      matches: loadMatchHistory(db, userId, 100),
      ledger,
      notes,
      audit: readAudit(db, { targetUserId: userId, limit: 100 }),
    };
  }

  /* ---------- Player actions. Each writes its audit row in the same transaction. ---------- */

  function audited<T>(actor: AdminActor, action: string, targetUserId: string, details: Record<string, unknown>, work: () => T) {
    return withTransaction(db, () => {
      const result = work();
      recordAudit(db, { adminId: actor.userId, action, targetUserId, details, ip: actor.ip });
      return result;
    });
  }

  function adjust(actor: AdminActor, userId: string, currency: Currency, amount: number, reason: string) {
    user(userId);
    // adjustBalance opens its own transaction, so audit right after it succeeds.
    const result = adjustBalance(db, { userId, currency, amount });
    if (!result.ok) {
      throw invalidInput(
        result.reason === "insufficient_balance"
          ? "Refused: that would take the available balance below zero."
          : `That player has no ${currency.toUpperCase()} wallet.`,
      );
    }
    recordAudit(db, {
      adminId: actor.userId,
      action: "player.balance_adjusted",
      targetUserId: userId,
      details: { currency, amount, reason, availableAfter: result.wallet.available },
      ip: actor.ip,
    });
  }

  function setStatus(actor: AdminActor, userId: string, status: "active" | "suspended", reason: string) {
    const row = user(userId);
    if (userId === actor.userId) throw invalidInput("You cannot suspend yourself.");
    if (row.status === status) throw invalidInput(`That player is already ${status}.`);
    audited(actor, status === "suspended" ? "player.suspended" : "player.reactivated", userId, { reason }, () => {
      db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, userId);
    });
    if (status === "suspended") live.disconnectUser(userId);
  }

  function setFrozen(actor: AdminActor, userId: string, frozen: boolean, reason: string) {
    user(userId);
    audited(actor, frozen ? "player.usdt_frozen" : "player.usdt_unfrozen", userId, { reason }, () => {
      db.prepare("UPDATE users SET usdt_frozen = ? WHERE id = ?").run(frozen ? 1 : 0, userId);
    });
  }

  function rename(actor: AdminActor, userId: string, name: string, reason: string) {
    const row = user(userId);
    try {
      audited(actor, "player.renamed", userId, { from: row.name, to: name, reason }, () => {
        db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, userId);
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw invalidInput("That display name is already taken.");
      }
      throw error;
    }
  }

  function releaseWallet(actor: AdminActor, userId: string, network: DepositNetwork, reason: string) {
    user(userId);
    const saved = db
      .prepare("SELECT address FROM deposit_wallets WHERE user_id = ? AND network = ?")
      .get(userId, network) as { address: string } | undefined;
    if (!saved) throw invalidInput(`That player has no saved ${NETWORK_INFO[network].label} wallet.`);
    audited(actor, "player.wallet_released", userId, { network, address: saved.address, reason }, () => {
      db.prepare("DELETE FROM deposit_wallets WHERE user_id = ? AND network = ?").run(userId, network);
    });
  }

  /** Ends every session of the player: HTTP, sockets and admin sessions. */
  function logoutEverywhere(actor: AdminActor, userId: string, reason: string) {
    user(userId);
    audited(actor, "player.logged_out", userId, { reason }, () => {
      db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").run(userId);
    });
    live.disconnectUser(userId);
  }

  /** Sets a temporary password, shown to the admin once, and ends every session. */
  async function setTemporaryPassword(actor: AdminActor, userId: string, reason: string) {
    user(userId);
    const password = temporaryPassword();
    const hash = await hashPassword(password);
    audited(actor, "player.temporary_password", userId, { reason }, () => {
      db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").run(hash, userId);
    });
    live.disconnectUser(userId);
    return { password };
  }

  function addNote(actor: AdminActor, userId: string, text: string) {
    user(userId);
    audited(actor, "player.note_added", userId, {}, () => {
      db.prepare("INSERT INTO admin_notes (id, user_id, admin_id, text, created_at) VALUES (?, ?, ?, ?, ?)").run(
        randomUUID(),
        userId,
        actor.userId,
        text,
        now().toISOString(),
      );
    });
  }

  /* ---------- Admins ---------- */

  function listAdmins() {
    return db
      .prepare("SELECT id, name, role, totp_enabled, last_seen_at FROM users WHERE role IS NOT NULL ORDER BY name")
      .all() as { id: string; name: string; role: AdminRole; totp_enabled: number; last_seen_at: string | null }[];
  }

  /**
   * Gives, changes or removes a role by display name. A change ends the
   * person's admin sessions. The last owner cannot be removed or demoted.
   */
  function setRole(actor: AdminActor, name: string, role: AdminRole | null) {
    const target = db.prepare("SELECT id, role FROM users WHERE name = ?").get(name) as
      | { id: string; role: AdminRole | null }
      | undefined;
    if (!target) throw notFound(`No player is called "${name}".`);
    if (target.role === role) throw invalidInput(role ? `${name} is already ${ROLE_INFO[role].label}.` : `${name} is not an admin.`);

    if (target.role === "owner" && role !== "owner") {
      const owners = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get() as { n: number };
      if (owners.n <= 1) throw invalidInput("There must always be at least one owner.");
    }

    audited(actor, "admin.role_changed", target.id, { from: target.role, to: role }, () => {
      // A removed admin also loses two-factor, so a returning admin sets it up afresh.
      db.prepare(
        `UPDATE users SET role = ?, token_version = token_version + 1,
           totp_enabled = CASE WHEN ? IS NULL THEN 0 ELSE totp_enabled END,
           totp_secret = CASE WHEN ? IS NULL THEN NULL ELSE totp_secret END
         WHERE id = ?`,
      ).run(role, role, role, target.id);
    });
    live.disconnectUser(target.id);
  }

  /** The owner resets someone's two-factor, for a lost phone. */
  function resetTwoFactor(actor: AdminActor, userId: string, reason: string) {
    user(userId);
    audited(actor, "admin.two_factor_reset", userId, { reason }, () => {
      db.prepare(
        "UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL, token_version = token_version + 1 WHERE id = ?",
      ).run(userId);
    });
    live.disconnectUser(userId);
  }

  return {
    gate: (userId: string) => {
      const row = user(userId);
      if (!row.role) throw new HttpError(403, "forbidden", "Only an admin can do that.");
      return { role: row.role, totpEnabled: row.totp_enabled === 1 };
    },
    setupTotp,
    enableTotp,
    startSession,
    dashboard,
    searchPlayers,
    playerDetail,
    adjust,
    setStatus,
    setFrozen,
    rename,
    releaseWallet,
    logoutEverywhere,
    setTemporaryPassword,
    addNote,
    listAdmins,
    setRole,
    resetTwoFactor,
    audit: (limit = 200) => readAudit(db, { limit }),
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
