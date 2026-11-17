import {
  NETWORK_INFO,
  can,
  formatAmount,
  parseAmount,
  depositNetworks,
  type AdminDepositAttempt,
  type AdminPlayerDetail,
  type Currency,
  type DepositNetwork,
} from "@game-platform/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  adminDepositsRequest,
  adminManualDeposit,
  adminPlayerAction,
  adminPlayerRequest,
  adminTempPassword,
  useAdminSession,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { StatusBadges } from "./admin-players";
import { ActionForm, AdminSection, CopyButton, Field, messageOf, when } from "./admin-ui";

const kindLabel: Record<string, string> = {
  signup_bonus: "Signup bonus",
  stake_lock: "Stake locked",
  stake_refund: "Stake unlocked",
  payout: "Match result",
  house_cut: "House cut",
  adjustment: "Admin adjustment",
  deposit: "Deposit",
  withdrawal_lock: "Withdrawal locked",
  withdrawal_refund: "Withdrawal returned",
};

export function AdminPlayerPage() {
  const { id = "" } = useParams();
  const role = useAdminSession((state) => state.session?.role);
  const [player, setPlayer] = useState<AdminPlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AdminDepositAttempt[]>([]);

  const load = useCallback(async () => {
    try {
      setPlayer(await adminPlayerRequest(id));
      setAttempts((await adminDepositsRequest({ userId: id })).attempts);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert" className="text-sm font-semibold text-danger">{error}</p>;
  if (!player) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const act = async (action: Parameters<typeof adminPlayerAction>[1], body: unknown) => {
    setPlayer(await adminPlayerAction(id, action, body));
  };
  const money = can(role, "money.adjust");
  const moderate = can(role, "players.moderate");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <Link to="/admin/players" className="hover:text-foreground">
          Players
        </Link>{" "}
        / {player.name}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl font-bold">{player.name}</h1>
        <StatusBadges player={player} />
      </div>
      <p className="text-sm text-muted-foreground">
        {player.email} · ID <code>{player.id}</code> · joined {when(player.createdAt)} · last seen {when(player.lastSeenAt)}
        {player.role ? ` · two-factor ${player.totpEnabled ? "on" : "not set up"}` : ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {player.wallets.map((wallet) => (
          <div key={wallet.currency} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">{wallet.currency.toUpperCase()}</p>
            <p className={cn("font-display text-2xl font-bold", wallet.currency === "usdt" ? "text-gold" : "text-primary")}>
              {formatAmount(wallet.currency, wallet.available)}
            </p>
            <p className="text-xs text-muted-foreground">{formatAmount(wallet.currency, wallet.locked)} locked</p>
          </div>
        ))}
      </div>

      {tempPassword ? (
        <div role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <p className="font-semibold text-gold">Temporary password, shown once. Give it to the player privately:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="font-mono text-lg font-bold" data-testid="temp-password">
              {tempPassword}
            </code>
            <CopyButton text={tempPassword} label="Copy temporary password" />
          </div>
        </div>
      ) : null}

      {money || moderate ? (
        <AdminSection title="Actions">
          <div className="grid gap-3 lg:grid-cols-2">
            {money ? (
              <ActionForm
                title="Adjust balance"
                submitLabel="Apply"
                onSubmit={async (reason, form) => {
                  const currency = String(form.get("currency")) as Currency;
                  const amount = parseAmount(currency, String(form.get("amount") ?? ""));
                  if (!amount) throw new Error("Enter an amount such as 5 or -0.5.");
                  await act("adjust", { currency, amount, reason });
                }}
              >
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Currency</span>
                  <select name="currency" className="h-9 rounded-xl border border-border bg-black/40 px-2 text-sm">
                    <option value="usdt">USDT</option>
                    <option value="rac">RAC</option>
                  </select>
                </label>
                <Field label="Amount (negative takes away)" name="amount" inputMode="decimal" placeholder="5" />
              </ActionForm>
            ) : null}

            {money ? (
              <ActionForm
                title={player.usdtFrozen ? "Unfreeze USDT" : "Freeze USDT (no USDT stakes or withdrawals)"}
                submitLabel={player.usdtFrozen ? "Unfreeze" : "Freeze"}
                danger={!player.usdtFrozen}
                onSubmit={(reason) => act("freeze", { frozen: !player.usdtFrozen, reason })}
              />
            ) : null}

            {moderate ? (
              <ActionForm
                title={player.status === "suspended" ? "Reactivate account" : "Suspend account (cannot log in)"}
                submitLabel={player.status === "suspended" ? "Reactivate" : "Suspend"}
                danger={player.status !== "suspended"}
                onSubmit={(reason) => act("status", { status: player.status === "suspended" ? "active" : "suspended", reason })}
              />
            ) : null}

            {moderate ? (
              <ActionForm title="Rename" submitLabel="Rename" onSubmit={(reason, form) => act("rename", { name: String(form.get("name") ?? "").trim(), reason })}>
                <Field label="New display name" name="name" maxLength={24} />
              </ActionForm>
            ) : null}

            {moderate ? (
              <ActionForm title="Log out everywhere" submitLabel="Log out" onSubmit={(reason) => act("logout", { reason })} />
            ) : null}

            {moderate ? (
              <ActionForm
                title="Set a temporary password (ends every session)"
                submitLabel="Set"
                onSubmit={async (reason) => {
                  setTempPassword((await adminTempPassword(id, reason)).password);
                  await load();
                }}
              />
            ) : null}

            {can(role, "admins.manage") && player.role ? (
              <ActionForm
                title="Reset two-factor (lost phone)"
                submitLabel="Reset"
                danger
                onSubmit={(reason) => act("reset-2fa", { reason })}
              />
            ) : null}
          </div>
        </AdminSection>
      ) : null}

      <AdminSection title="Saved wallets">
        {player.savedWallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="space-y-2">
            {player.savedWallets.map((wallet) => (
              <li key={wallet.network} className="space-y-2">
                <p className="break-all text-sm">
                  <span className="font-semibold">{NETWORK_INFO[wallet.network].label}</span> <code>{wallet.address}</code>
                </p>
                {money ? (
                  <ActionForm
                    title={`Release this ${NETWORK_INFO[wallet.network].label} wallet`}
                    submitLabel="Release"
                    danger
                    onSubmit={(reason) => act("release-wallet", { network: wallet.network, reason })}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Admin notes">
        {can(role, "players.notes") ? (
          <ActionForm
            title="Add a note (private to admins)"
            submitLabel="Add"
            needsReason={false}
            onSubmit={(_reason, form) => act("notes", { text: String(form.get("text") ?? "") })}
          >
            <Field label="Note" name="text" maxLength={1000} />
          </ActionForm>
        ) : null}
        <ul className="mt-3 space-y-2">
          {player.notes.map((note) => (
            <li key={note.id} className="text-sm">
              <span className="text-xs text-muted-foreground">
                {note.adminName} · {when(note.createdAt)}
              </span>
              <p>{note.text}</p>
            </li>
          ))}
        </ul>
      </AdminSection>

      {money ? (
        <AdminSection title="Credit a deposit by hand">
          <p className="mb-2 text-xs text-muted-foreground">
            For money that really arrived but the normal claim refused: under 3 USDT, or sent from a wallet the player
            never saved. The chain must show real USDT reaching our address; the amount comes from the chain, minus the
            1% fee, and the TxID can never be credited twice.
          </p>
          <ActionForm
            title="Credit from a transaction"
            submitLabel="Check and credit"
            onSubmit={async (reason, form) => {
              await adminManualDeposit({
                userId: id,
                network: String(form.get("network")) as DepositNetwork,
                txId: String(form.get("txId") ?? "").trim(),
                reason,
              });
              await load();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Network</span>
              <select name="network" className="h-9 rounded-xl border border-border bg-black/40 px-2 text-sm">
                {depositNetworks.map((network) => (
                  <option key={network} value={network}>
                    {NETWORK_INFO[network].label}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Transaction ID" name="txId" />
          </ActionForm>
          {attempts.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm" aria-label="Refused claims for this player">
              {attempts.map((attempt) => (
                <li key={attempt.id} className="break-all">
                  <span className="text-xs text-muted-foreground">{when(attempt.createdAt)}</span>{" "}
                  {NETWORK_INFO[attempt.network].label} · {attempt.message}
                  <span className="block text-xs text-muted-foreground">TxID {attempt.txId}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </AdminSection>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection title="Deposits">
          {player.deposits.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
          <ul className="space-y-2 text-sm">
            {player.deposits.map((deposit) => (
              <li key={deposit.id} className="break-all">
                <span className="font-semibold text-gold">{formatAmount("usdt", deposit.credited, { sign: true })}</span>{" "}
                {NETWORK_INFO[deposit.network].label} · {when(deposit.createdAt)}
                <span className="block text-xs text-muted-foreground">TxID {deposit.txId}</span>
              </li>
            ))}
          </ul>
        </AdminSection>
        <AdminSection title="Withdrawals">
          {player.withdrawals.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
          <ul className="space-y-2 text-sm">
            {player.withdrawals.map((item) => (
              <li key={item.id} className="break-all">
                <span className="font-semibold">{formatAmount("usdt", item.amount)}</span> {item.status} ·{" "}
                {NETWORK_INFO[item.network].label} · {when(item.createdAt)}
                <span className="block text-xs text-muted-foreground">
                  {item.address}
                  {item.payoutTxId ? ` · TxID ${item.payoutTxId}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </AdminSection>
      </div>

      <AdminSection title="Matches">
        {player.matches.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
        <ul className="space-y-1 text-sm">
          {player.matches.map((match) => (
            <li key={match.matchId}>
              {match.result === "win" ? "Win" : "Loss"} vs {match.opponentName} {match.yourScore}–{match.opponentScore} ·{" "}
              {formatAmount(match.currency, match.delta, { sign: true })} · {when(match.finishedAt)}
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title="Ledger (latest 200)">
        <table className="w-full text-sm">
          <tbody>
            {player.ledger.map((entry) => (
              <tr key={entry.id} className="border-t border-border first:border-0">
                <td className="py-1 text-xs text-muted-foreground">{when(entry.createdAt)}</td>
                <td className="py-1">{kindLabel[entry.kind] ?? entry.kind}</td>
                <td className={cn("py-1 text-right font-semibold", entry.amount < 0 ? "text-danger" : "text-primary")}>
                  {formatAmount(entry.currency, entry.amount, { sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminSection>

      <AdminSection title="Admin actions on this player">
        {player.audit.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
        <ul className="space-y-1 text-sm">
          {player.audit.map((entry) => (
            <li key={entry.id}>
              <span className="text-xs text-muted-foreground">{when(entry.createdAt)}</span> {entry.adminName} ·{" "}
              <code>{entry.action}</code>{" "}
              {typeof entry.details.reason === "string" ? `· ${entry.details.reason}` : ""}
            </li>
          ))}
        </ul>
      </AdminSection>
    </div>
  );
}
