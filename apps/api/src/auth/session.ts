import type { User } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { readWallets } from "../economy/wallet";

type UserRow = {
  id: string;
  name: string;
  email: string;
  created_at: string;
  password_hash?: string;
  is_admin?: number;
};

export function toPublicUser(row: {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  created_at?: string;
  is_admin?: number;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    ...(row.is_admin === 1 ? { isAdmin: true } : {}),
  };
}

export function findUserByEmail(db: AppDatabase, email: string) {
  return db
    .prepare("SELECT id, name, email, password_hash, created_at, is_admin FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;
}

export function loadAccount(db: AppDatabase, userId: string) {
  const user = db
    .prepare("SELECT id, name, email, created_at, is_admin FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;

  if (!user) {
    return undefined;
  }

  return {
    user: toPublicUser(user),
    wallets: readWallets(db, userId),
  };
}
