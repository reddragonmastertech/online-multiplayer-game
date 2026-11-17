import { NETWORK_INFO, can, formatAmount, type AdminWithdrawal } from "@game-platform/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { adminDecideWithdrawal, adminWithdrawalsRequest, useAdminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { CopyButton, inputClass, messageOf } from "./admin-ui";

/** One pending request: what to send, where, and the two ways to close it. */
function PendingRow({
  item,
  canDecide,
  onDecided,
}: {
  item: AdminWithdrawal;
  canDecide: boolean;
  onDecided: () => Promise<void>;
}) {
  const [txId, setTxId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = NETWORK_INFO[item.network];
  const payout = formatAmount("usdt", item.payout);

  async function decide(event: FormEvent, action: "paid" | "reject") {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminDecideWithdrawal(item.id, action === "paid" ? { action, txId } : { action, reason });
      await onDecided();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-gold/40 bg-card p-4" aria-label={`Withdrawal for ${item.userName}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{item.userName}</span>
        <span className="text-xs text-muted-foreground">asked {new Date(item.createdAt).toLocaleString()}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatAmount("usdt", item.amount)} locked · {formatAmount("usdt", item.fee)} fee
        </span>
      </div>

      <p className="mt-3 text-sm">
        Send exactly <span className="font-display text-lg font-bold text-gold">{payout}</span> on{" "}
        <span className="font-semibold">
          {info.chain} ({info.label})
        </span>{" "}
        to:
      </p>
      <div className="mt-1 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
        <code className="min-w-0 flex-1 break-all text-sm font-semibold">{item.address}</code>
        <CopyButton text={item.address} label={`Copy ${item.userName}'s address`} />
      </div>

      {canDecide ? (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <form onSubmit={(event) => decide(event, "paid")} className="space-y-1.5">
          <label htmlFor={`tx-${item.id}`} className="block text-xs text-muted-foreground">
            After sending, paste your transaction ID
          </label>
          <div className="flex gap-2">
            <input
              id={`tx-${item.id}`}
              value={txId}
              onChange={(event) => setTxId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={cn(inputClass, "font-mono")}
            />
            <Button type="submit" size="sm" className="h-9" disabled={busy || !txId.trim()}>
              Mark paid
            </Button>
          </div>
        </form>
        <form onSubmit={(event) => decide(event, "reject")} className="space-y-1.5">
          <label htmlFor={`reason-${item.id}`} className="block text-xs text-muted-foreground">
            Or reject it (the player sees the reason)
          </label>
          <div className="flex gap-2">
            <input
              id={`reason-${item.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              className={inputClass}
            />
            <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={busy || !reason.trim()}>
              Reject
            </Button>
          </div>
        </form>
      </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Your role can see this request but not decide it.</p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function AdminWithdrawalsPage() {
  const role = useAdminSession((state) => state.session?.role);
  const [items, setItems] = useState<AdminWithdrawal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await adminWithdrawalsRequest()).withdrawals);
      setLoadError(null);
    } catch (cause) {
      setLoadError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = (items ?? []).filter((item) => item.status === "pending");
  const decided = (items ?? []).filter((item) => item.status !== "pending");

  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="font-display text-4xl font-bold">Withdrawals</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Send each payout from your own wallet, then mark it paid with the transaction ID. Rejecting returns the full
          amount to the player.
        </p>
        <Button className="mt-4" size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>

        {loadError ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger">
            {loadError}
          </p>
        ) : null}

        <h2 className="mt-8 text-sm font-semibold tracking-[0.16em] text-muted-foreground">
          WAITING ({pending.length})
        </h2>
        {items && pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing is waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((item) => (
              <PendingRow key={item.id} item={item} canDecide={can(role, "withdrawals.decide")} onDecided={load} />
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-sm font-semibold tracking-[0.16em] text-muted-foreground">DECIDED</h2>
        {decided.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4" aria-label="Decided withdrawals">
            {decided.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
                <span className="font-semibold">{item.userName}</span>
                <span className={item.status === "paid" ? "text-primary" : "text-danger"}>
                  {item.status === "paid" ? "Paid" : "Rejected"}
                </span>
                <span className="ml-auto">{formatAmount("usdt", item.payout)}</span>
                <span className="w-full break-all text-xs text-muted-foreground">
                  {NETWORK_INFO[item.network].label} · {item.address} · by {item.decidedBy ?? "?"}{" "}
                  {item.decidedAt ? new Date(item.decidedAt).toLocaleString() : ""}
                  {item.payoutTxId ? ` · TxID ${item.payoutTxId}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
