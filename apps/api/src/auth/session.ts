import type { User } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { readWallets } from "../economy/wallet";

type UserRow = {
  id: string;
  name: string;
  email: string;
  created_at: string;
  password_hash?: string;
  role?: string | null;
  status?: string;
  token_version?: number;
};

export function toPublicUser(row: {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  created_at?: string;
  role?: string | null;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    ...(row.role ? { role: row.role as NonNullable<User["role"]> } : {}),
  };
}

export function findUserByEmail(db: AppDatabase, email: string) {
  return db
    .prepare("SELECT id, name, email, password_hash, created_at, role, status, token_version FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;
}

export function loadAccount(db: AppDatabase, userId: string) {
  const user = db
    .prepare("SELECT id, name, email, created_at, role FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;

  if (!user) {
    return undefined;
  }

  return {
    user: toPublicUser(user),
    wallets: readWallets(db, userId),
  };
}
