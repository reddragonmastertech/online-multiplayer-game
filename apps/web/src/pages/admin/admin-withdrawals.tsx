import { NETWORK_INFO, can, formatAmount, type AdminWithdrawal, type WithdrawalDecision } from "@game-platform/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { adminDecideWithdrawal, adminWithdrawalsRequest, useAdminSession } from "@/lib/admin-api";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";
import { CopyButton, inputClass, messageOf, when } from "./admin-ui";

/**
 * One open request. The flow: Claim ("I am sending this"), send the payout
 * from your own wallet, paste the TxID, Mark paid. The server checks the
 * chain before it accepts. Or Reject, which returns the full amount.
 */
function OpenRow({ item, canDecide, isOwner, myId, onChanged }: {
  item: AdminWithdrawal;
  canDecide: boolean;
  isOwner: boolean;
  myId: string;
  onChanged: () => Promise<void>;
}) {
  const [txId, setTxId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = NETWORK_INFO[item.network];
  const payout = formatAmount("usdt", item.payout);
  const mine = item.status === "processing" && item.claimedById === myId;
  const someoneElse = item.status === "processing" && !mine;

  async function run(decision: WithdrawalDecision, event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminDecideWithdrawal(item.id, decision);
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={cn("rounded-2xl border bg-card p-4", mine ? "border-primary" : "border-gold/40")}
      aria-label={`Withdrawal for ${item.userName}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{item.userName}</span>
        <span className="text-xs text-muted-foreground">asked {when(item.createdAt)}</span>
        {item.needsApproval ? (
          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">
            {item.approvedBy ? `Approved by ${item.approvedBy}` : "Needs a second admin's approval"}
          </span>
        ) : null}
        {item.status === "processing" ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {mine ? "You are sending this" : `Being sent by ${item.claimedBy ?? "another admin"}`}
          </span>
        ) : null}
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

      {!canDecide ? (
        <p className="mt-3 text-xs text-muted-foreground">Your role can see this request but not decide it.</p>
      ) : item.status === "pending" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {item.needsApproval && !item.approvedById ? (
            <Button size="sm" disabled={busy} onClick={() => void run({ action: "approve" })}>
              Approve (large withdrawal)
            </Button>
          ) : item.needsApproval && item.approvedById === myId ? (
            <p className="text-xs text-muted-foreground">You approved it; a different admin sends it.</p>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void run({ action: "claim" })}>
              Claim and send
            </Button>
          )}
          <form onSubmit={(event) => void run({ action: "reject", reason }, event)} className="flex flex-1 items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs text-muted-foreground">Or reject it (the player sees the reason)</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} className={inputClass} />
            </label>
            <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={busy || !reason.trim()}>
              Reject
            </Button>
          </form>
        </div>
      ) : mine ? (
        <div className="mt-3 space-y-2">
          <form onSubmit={(event) => void run({ action: "paid", txId }, event)} className="flex items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs text-muted-foreground">
                After sending, paste your transaction ID. It is checked on the chain.
              </span>
              <input
                value={txId}
                onChange={(event) => setTxId(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={cn(inputClass, "font-mono")}
              />
            </label>
            <Button type="submit" size="sm" className="h-9" disabled={busy || !txId.trim()}>
              {busy ? "Checking…" : "Mark paid"}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ action: "release" })}>
              Release (I did not send it)
            </Button>
            <form onSubmit={(event) => void run({ action: "reject", reason }, event)} className="flex flex-1 items-end gap-2">
              <label className="block min-w-0 flex-1">
                <span className="sr-only">Rejection reason</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason, to reject instead"
                  maxLength={200}
                  className={inputClass}
                />
              </label>
              <Button type="submit" size="sm" variant="secondary" className="h-9" disabled={busy || !reason.trim()}>
                Reject
              </Button>
            </form>
          </div>
        </div>
      ) : someoneElse && isOwner ? (
        <Button className="mt-3" size="sm" variant="ghost" disabled={busy} onClick={() => void run({ action: "release" })}>
          Release {item.claimedBy}'s claim
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Only {item.claimedBy} can finish this one.</p>
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
  const myId = useSessionStore((state) => state.user?.id) ?? "";
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

  const open = (items ?? []).filter((item) => item.status === "pending" || item.status === "processing");
  const decided = (items ?? []).filter((item) => item.status === "paid" || item.status === "rejected");

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="font-display text-3xl font-bold">Withdrawals</h1>
      <p className="text-sm text-muted-foreground">
        Claim a request before sending, so nobody else pays it too. Send from your own wallet, then mark it paid with
        the transaction ID; the server checks it on the chain. Rejecting returns the full amount to the player.
      </p>
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
      {loadError ? <p role="alert" className="text-sm font-semibold text-danger">{loadError}</p> : null}

      <h2 className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">OPEN ({open.length})</h2>
      {items && open.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is waiting.</p> : null}
      <ul className="space-y-3">
        {open.map((item) => (
          <OpenRow
            key={item.id}
            item={item}
            canDecide={can(role, "withdrawals.decide")}
            isOwner={role === "owner"}
            myId={myId}
            onChanged={load}
          />
        ))}
      </ul>

      <h2 className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">DECIDED</h2>
      {decided.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4" aria-label="Decided withdrawals">
          {decided.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
              <span className="font-semibold">{item.userName}</span>
              <span className={item.status === "paid" ? "text-primary" : "text-danger"}>
                {item.status === "paid" ? "Paid" : "Rejected"}
              </span>
              <span className="ml-auto">{formatAmount("usdt", item.payout)}</span>
              <span className="w-full break-all text-xs text-muted-foreground">
                {NETWORK_INFO[item.network].label} · {item.address} · by {item.decidedBy ?? "?"} {when(item.decidedAt)}
                {item.payoutTxId ? ` · TxID ${item.payoutTxId}` : ""}
                {item.note ? ` · ${item.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
