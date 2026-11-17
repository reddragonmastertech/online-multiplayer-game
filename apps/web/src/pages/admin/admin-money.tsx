import {
  NETWORK_INFO,
  can,
  formatAmount,
  parseAmount,
  type AdminDeposit,
  type AdminDepositAttempt,
  type HouseSweep,
  type ReconciliationReport,
  type SolvencyReport,
} from "@game-platform/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  adminDepositsRequest,
  adminRecordSweep,
  adminSolvencyRequest,
  adminSweepsRequest,
  useAdminSession,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { ActionForm, AdminSection, Field, inputClass, messageOf, when } from "./admin-ui";

const usdt = (amount: number, sign = false) => formatAmount("usdt", amount, { sign });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 py-1", strong && "border-t border-border font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Books({ books }: { books: ReconciliationReport }) {
  return (
    <AdminSection title="USDT books">
      <p className={cn("rounded-xl px-3 py-2 text-sm font-semibold", books.ok ? "bg-primary/10 text-primary" : "bg-danger/15 text-danger")}>
        {books.ok ? "The books balance." : `The books are off by ${usdt(books.difference, true)}.`}
      </p>
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">HELD</p>
          <Row label="Players (available + locked)" value={usdt(books.actual.players)} />
          <Row label="House earnings" value={usdt(books.actual.house)} />
          <Row label="Total" value={usdt(books.actual.total)} strong />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">SHOULD BE</p>
          <Row label="Deposits received" value={usdt(books.expected.deposits)} />
          <Row label="Admin adjustments" value={usdt(books.expected.adjustments, true)} />
          <Row label="Withdrawals paid out" value={usdt(-books.expected.payouts, true)} />
          <Row label="Total" value={usdt(books.expected.total)} strong />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Checked {when(books.checkedAt)}. The server also checks hourly and logs any mismatch.</p>
    </AdminSection>
  );
}

function Solvency({ report }: { report: SolvencyReport }) {
  return (
    <AdminSection title="Receiving wallets on-chain">
      {report.networks.length === 0 ? <p className="text-sm text-muted-foreground">No receiving address is set.</p> : null}
      <ul className="space-y-1 text-sm">
        {report.networks.map((row) => (
          <li key={row.network} className="flex flex-wrap justify-between gap-2">
            <span>
              <span className="font-semibold">{NETWORK_INFO[row.network].label}</span>{" "}
              <code className="text-xs text-muted-foreground">{row.address}</code>
            </span>
            {row.reachable ? (
              <span>{usdt(row.balance ?? 0)}</span>
            ) : (
              <span className="font-semibold text-danger">Unreachable: {row.error}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 text-sm">
        <Row label="On-chain at our addresses" value={usdt(report.onChain)} />
        <Row label="Owed to players" value={usdt(report.owed.players)} />
        <Row label="House earnings not yet swept" value={usdt(report.owed.house)} />
        <Row label={report.margin >= 0 ? "Margin" : "Shortfall"} value={usdt(report.margin, true)} strong />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A shortfall can be fine if you moved funds to another wallet you control. Record moved house earnings as a
        sweep; player money should stay at the receiving addresses.
      </p>
    </AdminSection>
  );
}

export function AdminMoneyPage() {
  const role = useAdminSession((state) => state.session?.role);
  const [checks, setChecks] = useState<{ reconciliation: ReconciliationReport; solvency: SolvencyReport } | null>(null);
  const [checking, setChecking] = useState(false);
  const [sweeps, setSweeps] = useState<{ available: number; sweeps: HouseSweep[] } | null>(null);
  const [deposits, setDeposits] = useState<{ deposits: AdminDeposit[]; attempts: AdminDepositAttempt[] } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setChecking(true);
    try {
      setChecks(await adminSolvencyRequest());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setChecking(false);
    }
  }, []);

  const loadDeposits = useCallback(async (q = "") => {
    try {
      setDeposits(await adminDepositsRequest({ q }));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void runChecks();
    void loadDeposits();
    adminSweepsRequest()
      .then(setSweeps)
      .catch((cause) => setError(messageOf(cause)));
  }, [runChecks, loadDeposits]);

  function search(event: FormEvent) {
    event.preventDefault();
    void loadDeposits(query.trim());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-bold">Money</h1>
        <Button className="ml-auto" size="sm" variant="secondary" disabled={checking} onClick={() => void runChecks()}>
          {checking ? "Checking the chains…" : "Check again"}
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

      {checks ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Books books={checks.reconciliation} />
          <Solvency report={checks.solvency} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Checking the books and the chains…</p>
      )}

      <AdminSection title="House sweeps">
        <p className="text-sm">
          House earnings not yet swept: <span className="font-semibold text-gold">{usdt(sweeps?.available ?? 0)}</span>
        </p>
        {can(role, "money.adjust") ? (
          <div className="mt-3">
            <ActionForm
              title="Record a sweep (earnings you took out)"
              submitLabel="Record"
              needsReason={false}
              onSubmit={async (_reason, form) => {
                const amount = parseAmount("usdt", String(form.get("amount") ?? ""));
                if (!amount || amount <= 0) throw new Error("Enter an amount such as 25.5.");
                setSweeps(await adminRecordSweep(amount, String(form.get("note") ?? "").trim()));
                await runChecks();
              }}
            >
              <Field label="Amount (USDT)" name="amount" inputMode="decimal" />
              <Field label="Where it went" name="note" maxLength={200} />
            </ActionForm>
          </div>
        ) : null}
        <ul className="mt-3 space-y-1 text-sm">
          {(sweeps?.sweeps ?? []).map((sweep) => (
            <li key={sweep.id}>
              {usdt(sweep.amount)} · {sweep.note} · {sweep.adminName} · {when(sweep.createdAt)}
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title="Deposits">
        <form onSubmit={search} className="flex gap-2" role="search">
          <label htmlFor="deposit-search" className="sr-only">
            Search deposits
          </label>
          <input
            id="deposit-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="TxID, sending address or player name"
            className={inputClass}
          />
          <Button type="submit" size="sm" className="h-9">
            Search
          </Button>
        </form>
        <ul className="mt-3 divide-y divide-border text-sm" aria-label="Deposit list">
          {(deposits?.deposits ?? []).map((deposit) => (
            <li key={deposit.id} className="break-all py-2">
              <Link to={`/admin/players/${deposit.userId}`} className="font-semibold text-primary">
                {deposit.userName}
              </Link>{" "}
              <span className="text-gold">{usdt(deposit.credited, true)}</span> · {NETWORK_INFO[deposit.network].label} ·{" "}
              {when(deposit.createdAt)}
              {deposit.manual ? <span className="ml-2 rounded-full bg-gold/15 px-2 text-[11px] text-gold">by hand</span> : null}
              <span className="block text-xs text-muted-foreground">
                TxID {deposit.txId} · from {deposit.fromAddress}
              </span>
            </li>
          ))}
        </ul>
        {deposits && deposits.deposits.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No deposits found.</p> : null}
      </AdminSection>

      <AdminSection title="Refused deposit claims">
        <p className="text-xs text-muted-foreground">
          What players tried that was not credited. If the money really arrived, credit it by hand from the player's page.
        </p>
        <ul className="mt-2 divide-y divide-border text-sm" aria-label="Refused claims">
          {(deposits?.attempts ?? []).map((attempt) => (
            <li key={attempt.id} className="break-all py-2">
              <Link to={`/admin/players/${attempt.userId}`} className="font-semibold text-primary">
                {attempt.userName}
              </Link>{" "}
              · {NETWORK_INFO[attempt.network].label} · {when(attempt.createdAt)}
              <span className="block text-xs text-muted-foreground">
                {attempt.message} · TxID {attempt.txId}
              </span>
            </li>
          ))}
        </ul>
        {deposits && deposits.attempts.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None.</p> : null}
      </AdminSection>
    </div>
  );
}
