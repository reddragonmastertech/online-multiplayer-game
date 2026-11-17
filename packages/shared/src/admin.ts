import { z } from "zod";
import { displayNameSchema } from "./auth";
import type { DepositRecord } from "./deposit";
import { depositNetworkSchema, type DepositNetwork } from "./deposit";
import { currencySchema, type Currency, type Wallet } from "./economy";
import type { MatchHistoryEntry } from "./match";
import type { WithdrawalRecord } from "./withdrawal";

/**
 * The admin area (Roadmap 4.2 part D1). Admins have one role each; a role is a
 * fixed set of permissions. Every admin must pass a two-factor code to get an
 * admin session, and every admin action lands in the audit log.
 */

export const adminRoles = ["owner", "finance", "moderator", "support"] as const;
export const adminRoleSchema = z.enum(adminRoles);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminPermissions = [
  /** See the dashboard, players, withdrawals and the audit log. */
  "view",
  /** Write private notes on a player. */
  "players.notes",
  /** Suspend, rename, set a temporary password, log out everywhere. */
  "players.moderate",
  /** Adjust balances, freeze USDT, release a saved wallet. */
  "money.adjust",
  /** Mark withdrawals paid or rejected. */
  "withdrawals.decide",
  /** Kill switches, maintenance mode and the announcement banner. */
  "site.control",
  /** Give and take away admin roles. */
  "admins.manage",
] as const;
export type AdminPermission = (typeof adminPermissions)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: adminPermissions,
  finance: ["view", "players.notes", "money.adjust", "withdrawals.decide", "site.control"],
  moderator: ["view", "players.notes", "players.moderate"],
  support: ["view"],
};

export const ROLE_INFO: Record<AdminRole, { label: string; detail: string }> = {
  owner: { label: "Owner", detail: "Everything, including managing admins." },
  finance: { label: "Finance", detail: "Balances, frozen USDT, saved wallets and withdrawals." },
  moderator: { label: "Moderator", detail: "Suspensions, renames, passwords and sessions." },
  support: { label: "Support", detail: "Read-only: can look, cannot change anything." },
};

export function can(role: AdminRole | null | undefined, permission: AdminPermission) {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export const accountStatusSchema = z.enum(["active", "suspended"]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

/* ---------- Requests ---------- */

export const adminCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });
export type AdminCode = z.infer<typeof adminCodeSchema>;

const reason = z.string().trim().min(3, "Give a reason.").max(200);

export const adminAdjustSchema = z.object({
  currency: currencySchema,
  /** Smallest units; negative takes away. */
  amount: z.number().int().refine((value) => value !== 0, "The amount cannot be zero."),
  reason,
});
export const adminStatusSchema = z.object({ status: accountStatusSchema, reason });
export const adminFreezeSchema = z.object({ frozen: z.boolean(), reason });
export const adminRenameSchema = z.object({ name: displayNameSchema, reason });
export const adminReleaseWalletSchema = z.object({ network: depositNetworkSchema, reason });
export const adminReasonSchema = z.object({ reason });
export const adminNoteSchema = z.object({ text: z.string().trim().min(1).max(1000) });
export const adminRoleUpdateSchema = z.object({
  name: displayNameSchema,
  role: adminRoleSchema.nullable(),
});

export type AdminAdjust = z.infer<typeof adminAdjustSchema>;
export type AdminStatusChange = z.infer<typeof adminStatusSchema>;
export type AdminFreeze = z.infer<typeof adminFreezeSchema>;
export type AdminRename = z.infer<typeof adminRenameSchema>;
export type AdminReleaseWallet = z.infer<typeof adminReleaseWalletSchema>;
export type AdminReason = z.infer<typeof adminReasonSchema>;
export type AdminNote = z.infer<typeof adminNoteSchema>;
export type AdminRoleUpdate = z.infer<typeof adminRoleUpdateSchema>;

/** The player actions, as the last segment of `/api/admin/players/:id/:action`. */
export const adminPlayerActions = {
  adjust: "money.adjust",
  freeze: "money.adjust",
  "release-wallet": "money.adjust",
  status: "players.moderate",
  rename: "players.moderate",
  "temp-password": "players.moderate",
  logout: "players.moderate",
  notes: "players.notes",
  "reset-2fa": "admins.manage",
} as const satisfies Record<string, AdminPermission>;
export type AdminPlayerAction = keyof typeof adminPlayerActions;

/* ---------- Responses ---------- */

export type AdminSession = { token: string; role: AdminRole; expiresAt: string };
export type AdminTotpSetup = { secret: string; uri: string };
/** Before a session: does this admin still need to set up two-factor? */
export type AdminGate = { role: AdminRole; totpEnabled: boolean };

export type AdminAlert = { level: "warning" | "error"; message: string };

export type AdminDashboard = {
  players: { total: number; newToday: number; newWeek: number; onlineNow: number };
  matches: {
    live: number;
    queueWaiting: number;
    today: { currency: Currency; count: number; volume: number }[];
  };
  money: {
    usdtHeld: { available: number; locked: number };
    depositsToday: { count: number; amount: number };
    withdrawalsWaiting: { count: number; amount: number };
    withdrawalsPaidToday: { count: number; payout: number };
    /** House earnings in USDT by kind: match_cut, deposit_fee, withdrawal_fee. */
    house: { kind: string; today: number; week: number; total: number }[];
  };
  alerts: AdminAlert[];
  reconciliation: ReconciliationReport;
  lastBackup: BackupInfo | null;
  generatedAt: string;
};

export type AdminPlayerSummary = {
  id: string;
  name: string;
  email: string;
  role: AdminRole | null;
  status: AccountStatus;
  usdtFrozen: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  rac: number;
  usdt: number;
};

export type AdminLedgerEntry = {
  id: string;
  currency: Currency;
  kind: string;
  amount: number;
  matchId: string | null;
  createdAt: string;
};

export type AdminNoteEntry = { id: string; adminName: string; text: string; createdAt: string };

export type AdminAuditEntry = {
  id: string;
  adminName: string;
  action: string;
  targetUserId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
};

export type AdminPlayerDetail = AdminPlayerSummary & {
  logins: { ip: string; userAgent: string | null; kind: "signup" | "login"; createdAt: string }[];
  linkedAccounts: { userId: string; name: string; sharedIps: string[]; status: AccountStatus }[];
  totpEnabled: boolean;
  wallets: Wallet[];
  savedWallets: { network: DepositNetwork; address: string }[];
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  matches: MatchHistoryEntry[];
  ledger: AdminLedgerEntry[];
  notes: AdminNoteEntry[];
  audit: AdminAuditEntry[];
};

export type AdminTempPassword = { password: string };

/* ---------- D2: money safety ---------- */

export const adminManualDepositSchema = z.object({
  userId: z.string().min(1),
  network: depositNetworkSchema,
  txId: z.string().trim().min(1).max(80),
  reason,
});
export type AdminManualDeposit = z.infer<typeof adminManualDepositSchema>;

export const adminSweepSchema = z.object({
  /** In 0.000001 USDT. */
  amount: z.number().int().positive(),
  note: z.string().trim().min(3, "Say where it went.").max(200),
});
export type AdminSweep = z.infer<typeof adminSweepSchema>;

export type AdminDeposit = DepositRecord & { userId: string; userName: string; manual: boolean };

export type AdminDepositAttempt = {
  id: string;
  userId: string;
  userName: string;
  network: DepositNetwork;
  txId: string;
  code: string;
  message: string;
  createdAt: string;
};

/**
 * USDT books. What players and the house have earned must equal what came in
 * minus what went out: players + house = deposits + adjustments − payouts.
 * Sweeps cancel out of this (they lower both sides) and are shown for reference.
 */
export type ReconciliationReport = {
  ok: boolean;
  /** actual − expected; anything but 0 is a problem. */
  difference: number;
  actual: { players: number; house: number; sweeps: number; total: number };
  expected: { deposits: number; adjustments: number; payouts: number; total: number };
  checkedAt: string;
};

export type SolvencyReport = {
  networks: {
    network: DepositNetwork;
    address: string;
    reachable: boolean;
    /** On-chain USDT at our receiving address, in 0.000001 USDT; null if unreachable. */
    balance: number | null;
    error?: string;
  }[];
  onChain: number;
  /** What players hold (available + locked) plus house earnings not yet swept. */
  owed: { players: number; house: number; total: number };
  /** onChain − owed. Negative means the receiving wallets alone cannot cover it. */
  margin: number;
  checkedAt: string;
};

export type HouseSweep = { id: string; amount: number; note: string; adminName: string; createdAt: string };

export type BackupInfo = { file: string; size: number; createdAt: string; by: string | null };

/* ---------- D3: game control ---------- */

export const adminVoidSchema = z.object({ reason });
export type AdminVoid = z.infer<typeof adminVoidSchema>;

export type AdminMatchPlayer = { userId: string; name: string; seat: "a" | "b"; score: number };

export type AdminMatchSummary = {
  id: string;
  currency: Currency;
  stake: number;
  status: string;
  round: number;
  winnerSeat: "a" | "b" | null;
  createdAt: string;
  finishedAt: string | null;
  players: AdminMatchPlayer[];
  /** Still running in this process right now. */
  live: boolean;
};

export type AdminMatchDetail = AdminMatchSummary & {
  rounds: { round: number; handA: string | null; handB: string | null; outcome: string | null; createdAt: string }[];
};

export type AdminLive = {
  matches: AdminMatchSummary[];
  queue: { userId: string; name: string; currency: Currency; stake: number; queuedAt: string }[];
};

/* ---------- D4: risk ---------- */

export type LoginEvent = { ip: string; userAgent: string | null; kind: "signup" | "login"; createdAt: string };

/** Another account that has signed in from one of the same IP addresses. */
export type LinkedAccount = { userId: string; name: string; sharedIps: string[]; status: AccountStatus };

/** Several accounts on one IP address: a flag to look at, not proof (homes and offices share addresses). */
export type IpCluster = { ip: string; accounts: { userId: string; name: string }[]; lastSeen: string };

/** Two players who meet again and again in USDT, one usually losing (chip dumping). */
export type CollusionFlag = {
  winner: { userId: string; name: string };
  loser: { userId: string; name: string };
  matches: number;
  winnerWins: number;
  /** USDT that moved from the loser to the winner, after the house cut. */
  netFlow: number;
  sharedIp: boolean;
};

/** A win rate that pure chance would rarely give over this many matches. */
export type WinRateFlag = { userId: string; name: string; matches: number; wins: number; winRate: number };

export type RiskReport = {
  windowDays: number;
  ipClusters: IpCluster[];
  collusion: CollusionFlag[];
  winRates: WinRateFlag[];
  thresholds: {
    collusionMinMatches: number;
    collusionMinShare: number;
    winRateMinMatches: number;
    winRateMinShare: number;
  };
};
