import type { User, Wallet } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  created_at: string;
  password_hash?: string;
};

type WalletRow = {
  available: number;
  locked: number;
};

export function toPublicUser(row: {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  created_at?: string;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  };
}

export function toPublicWallets(row: { available: number; locked: number } | undefined): Wallet[] {
  return [
    {
      currency: "rac",
      available: row?.available ?? 0,
      locked: row?.locked ?? 0,
    },
  ];
}

export function findUserByEmail(db: AppDatabase, email: string) {
  return db
    .prepare("SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;
}

export function loadAccount(db: AppDatabase, userId: string) {
  const user = db
    .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;

  if (!user) {
    return undefined;
  }

  const wallet = db
    .prepare("SELECT available, locked FROM wallets WHERE user_id = ? AND currency = 'rac'")
    .get(userId) as WalletRow | undefined;

  return {
    user: toPublicUser(user),
    wallets: toPublicWallets(wallet),
  };
}
