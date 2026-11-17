/**
 * Admin tool: show or correct a player's balance by hand.
 *
 *   pnpm --filter @game-platform/api balance -- "<display name>"
 *   pnpm --filter @game-platform/api balance -- "<display name>" usdt 5
 *   pnpm --filter @game-platform/api balance -- "<display name>" usdt -0.5
 *
 * Every change is a ledger row of kind `adjustment`, so it shows up in the
 * books like any other movement. It reads the same `.env` as the server, so it
 * changes the live database. Back it up first.
 */
import { currencySchema, formatAmount, parseAmount } from "@game-platform/shared";
import { createDatabase } from "../db/client";
import { adjustBalance, houseTotal, readWallets } from "../economy/wallet";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const [name, currencyArg, amountArg] = process.argv.slice(2).filter((arg) => arg !== "--");
if (!name) {
  fail('Usage: balance -- "<display name>" [rac|usdt <amount>]');
}

const { db } = createDatabase(process.env.DATABASE_URL);
const user = db.prepare("SELECT id, name FROM users WHERE name = ?").get(name) as
  | { id: string; name: string }
  | undefined;
if (!user) {
  fail(`No player is called "${name}".`);
}

if (currencyArg !== undefined) {
  const currency = currencySchema.safeParse(currencyArg.toLowerCase());
  if (!currency.success) fail(`Currency must be rac or usdt, not "${currencyArg}".`);

  const amount = amountArg === undefined ? undefined : parseAmount(currency.data, amountArg);
  if (amount === undefined || amount === 0) {
    fail(`"${amountArg ?? ""}" is not an amount of ${currency.data.toUpperCase()}. Example: 5 or -0.5`);
  }

  const result = adjustBalance(db, { userId: user.id, currency: currency.data, amount });
  if (!result.ok) {
    fail(
      result.reason === "insufficient_balance"
        ? "Refused: that would take the available balance below zero."
        : `${user.name} has no ${currency.data.toUpperCase()} wallet.`,
    );
  }
  console.log(`${formatAmount(currency.data, amount, { sign: true })} for ${user.name}.`);
}

for (const wallet of readWallets(db, user.id)) {
  console.log(
    `${user.name}: ${formatAmount(wallet.currency, wallet.available)} available, ${formatAmount(wallet.currency, wallet.locked)} locked`,
  );
}
console.log(`House earnings: ${formatAmount("usdt", houseTotal(db, "usdt"))}`);
db.close();
