import {
  NETWORK_INFO,
  WITHDRAWAL_RULES,
  formatAmount,
  parseAmount,
  withdrawalFee,
  type DepositNetwork,
  type DepositOverview,
  type WithdrawalRecord,
} from "@game-platform/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, requestWithdrawal, withdrawalsRequest } from "@/lib/api";
import { useSiteStore } from "@/stores/site-store";
import { cn } from "@/lib/utils";

const statusLabel: Record<WithdrawalRecord["status"], string> = {
  pending: "Waiting for approval",
  processing: "Being sent",
  paid: "Paid",
  rejected: "Rejected",
};

/**
 * Ask for a USDT withdrawal. The amount is locked at once; an admin sends the
 * USDT by hand and marks it paid, or rejects it and the amount comes back.
 */
export function WithdrawPanel({
  available,
  overview,
  onOpenTopUp,
  onChanged,
}: {
  /** USDT available, in 0.000001 USDT. */
  available: number;
  overview: DepositOverview | null;
  onOpenTopUp: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const savedNetworks = (overview?.wallets ?? []).map((wallet) => wallet.network);
  const [network, setNetwork] = useState<DepositNetwork | null>(null);
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const site = useSiteStore((state) => state.settings);

  const load = useCallback(async () => {
    try {
      setWithdrawals((await withdrawalsRequest()).withdrawals);
    } catch {
      setWithdrawals([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = network && savedNetworks.includes(network) ? network : (savedNetworks[0] ?? null);
  const address = overview?.wallets.find((wallet) => wallet.network === chosen)?.address;
  const amount = parseAmount("usdt", amountText);
  const validAmount = amount !== undefined && amount > 0 ? amount : undefined;
  const waiting = withdrawals.some((item) => item.status === "pending" || item.status === "processing");
  const paused = chosen !== null && !site.withdrawals[chosen];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen || validAmount === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await requestWithdrawal({ network: chosen, amount: validAmount });
      setAmountText("");
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-3xl border border-border bg-card p-6" aria-labelledby="withdraw-heading">
      <h2 id="withdraw-heading" className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">
        WITHDRAW USDT
      </h2>

      {savedNetworks.length === 0 ? (
        <div className="mt-4 text-sm text-muted-foreground">
          <p>Withdrawals are paid to the wallet you saved for deposits. Save one first.</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={onOpenTopUp}>
            Save a wallet under Top up
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div role="radiogroup" aria-label="Withdrawal network" className="flex flex-wrap gap-2">
            {savedNetworks.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={chosen === id}
                onClick={() => setNetwork(id)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  chosen === id ? "border-primary bg-elevated" : "border-border text-muted-foreground",
                )}
              >
                {NETWORK_INFO[id].label}
              </button>
            ))}
          </div>
          <p className="break-all text-xs text-muted-foreground">To your wallet {address}</p>

          <label htmlFor="withdraw-amount" className="block text-sm text-muted-foreground">
            Amount in USDT (minimum {formatAmount("usdt", WITHDRAWAL_RULES.minimum)}, you have{" "}
            {formatAmount("usdt", available)} available)
          </label>
          <div className="flex gap-2">
            <input
              id="withdraw-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              placeholder="10"
              className="h-10 w-full min-w-0 rounded-xl border border-border bg-black/40 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="sm" className="h-10" disabled={busy || waiting || paused || validAmount === undefined}>
              Request
            </Button>
          </div>
          {validAmount !== undefined ? (
            <p className="text-sm text-muted-foreground">
              Fee {formatAmount("usdt", withdrawalFee(validAmount))} ({WITHDRAWAL_RULES.feeBps / 100}%) · You receive{" "}
              <span className="font-semibold text-foreground">
                {formatAmount("usdt", validAmount - withdrawalFee(validAmount))}
              </span>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The amount is locked when you ask. It is sent by hand after a check, usually within a day.
            {waiting ? " You already have a request waiting." : ""}
            {paused && chosen ? ` ${NETWORK_INFO[chosen].label} withdrawals are paused right now.` : ""}
          </p>
          {error ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </form>
      )}

      {withdrawals.length > 0 ? (
        <ul className="mt-4 divide-y divide-border" aria-label="Withdrawals">
          {withdrawals.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className="text-sm font-semibold">Withdrawal</span>
              <span className="text-xs text-muted-foreground">{NETWORK_INFO[item.network].label}</span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  item.status === "paid" && "text-primary",
                  (item.status === "pending" || item.status === "processing") && "text-gold",
                  item.status === "rejected" && "text-danger",
                )}
              >
                {statusLabel[item.status]}
              </span>
              <span className="ml-auto text-sm font-semibold">{formatAmount("usdt", -item.amount, { sign: true })}</span>
              <span className="w-full break-all text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()} · {formatAmount("usdt", item.payout)} to {item.address}
                {item.payoutTxId ? ` · TxID ${item.payoutTxId}` : ""}
                {item.status === "rejected" ? ` · Returned to your balance. ${item.note ?? ""}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
