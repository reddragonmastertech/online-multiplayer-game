import {
  CURRENCY_RULES,
  DEPOSIT_RULES,
  NETWORK_INFO,
  currencies,
  formatAmount,
  type DepositOverview,
  type MatchHistoryEntry,
} from "@game-platform/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TopUpDialog, UsdtMark } from "@/components/wallet/top-up-dialog";
import { WithdrawPanel } from "@/components/wallet/withdraw-panel";
import { depositOverviewRequest, matchHistoryRequest } from "@/lib/api";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

function MatchHistory({ matches }: { matches: MatchHistoryEntry[] | null }) {
  if (matches === null) {
    return <p className="mt-3 text-sm text-muted-foreground">Loading match history…</p>;
  }

  if (matches.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No matches yet. Finished PvP matches will appear here.
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-border">
      {matches.map((match) => (
        <li key={match.matchId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
          <span
            className={
              match.result === "win"
                ? "text-sm font-semibold text-primary"
                : "text-sm font-semibold text-muted-foreground"
            }
          >
            {match.result === "win" ? "Win" : "Loss"}
          </span>
          <span className="text-sm">vs {match.opponentName}</span>
          <span className="text-sm text-muted-foreground">
            {match.yourScore}–{match.opponentScore}
          </span>
          {match.reason !== "completed" ? (
            <span className="text-xs text-muted-foreground">
              by {match.reason === "forfeit" ? "forfeit" : "disconnect"}
            </span>
          ) : null}
          <span className="ml-auto text-sm font-semibold">
            {formatAmount(match.currency, match.delta, { sign: true })}
          </span>
          <span className="w-full text-xs text-muted-foreground">
            {new Date(match.finishedAt).toLocaleString()} · {formatAmount(match.currency, match.stake)} stake
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AccountPage() {
  const user = useSessionStore((state) => state.user);
  const wallets = useSessionStore((state) => state.wallets);
  const status = useSessionStore((state) => state.status);
  const logout = useSessionStore((state) => state.logout);
  const openAuth = useUiStore((state) => state.openAuth);
  const [matches, setMatches] = useState<MatchHistoryEntry[] | null>(null);
  const refreshSession = useSessionStore((state) => state.refresh);
  const [deposits, setDeposits] = useState<DepositOverview | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const topUpOpen = searchParams.get("topup") === "usdt";

  const loadDeposits = useCallback(async () => {
    try {
      setDeposits(await depositOverviewRequest());
    } catch {
      setDeposits(null);
    }
  }, []);

  useEffect(() => {
    if (user) void loadDeposits();
    else setDeposits(null);
  }, [user, loadDeposits]);

  function setTopUp(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("topup", "usdt");
    else next.delete("topup");
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (!user) {
      setMatches(null);
      return;
    }

    let alive = true;
    matchHistoryRequest()
      .then((response) => {
        if (alive) setMatches(response.matches);
      })
      .catch(() => {
        if (alive) setMatches([]);
      });

    return () => {
      alive = false;
    };
  }, [user]);

  if (status === "boot") {
    return (
      <div className="grid h-full place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-3xl font-bold">Account</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Log in to see your name and balances.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => openAuth("login")}>Log in</Button>
            <Button variant="secondary" onClick={() => openAuth("signup")}>
              Sign up
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">
          <Link to="/lobby" className="hover:text-foreground">
            Lobby
          </Link>
          <span aria-hidden="true"> / </span>
          Account
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold">{user.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {currencies.map((currency) => {
            const wallet = wallets.find((item) => item.currency === currency);
            const paid = currency === "usdt";
            return (
              <section
                key={currency}
                className={paid ? "rounded-3xl border border-gold/40 bg-card p-6" : "rounded-3xl border border-primary/40 bg-card p-6"}
              >
                <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                  {CURRENCY_RULES[currency].label} BALANCE · {paid ? "PAID" : "FREE"}
                </p>
                <p className={paid ? "mt-2 font-display text-5xl font-bold text-gold" : "mt-2 font-display text-5xl font-bold text-primary"}>
                  {formatAmount(currency, wallet?.available ?? 0, { unit: false })}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Available {formatAmount(currency, wallet?.available ?? 0)} · Locked{" "}
                  {formatAmount(currency, wallet?.locked ?? 0)}
                </p>
              </section>
            );
          })}
        </div>

        <section className="mt-4 rounded-3xl border border-border bg-card p-6" aria-labelledby="top-up-heading">
          <h2 id="top-up-heading" className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">
            TOP UP
          </h2>
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border p-4">
            <UsdtMark />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">USDT</p>
              <p className="text-sm text-muted-foreground">Confirmation: {DEPOSIT_RULES.confirmationTime}</p>
              <p className="text-sm text-muted-foreground">Fee: {DEPOSIT_RULES.feeBps / 100}%</p>
            </div>
            <Button size="sm" onClick={() => setTopUp(true)} disabled={!deposits} aria-label="Select USDT top-up">
              Select
            </Button>
          </div>
          <DepositHistory overview={deposits} />
        </section>

        <WithdrawPanel
          available={wallets.find((wallet) => wallet.currency === "usdt")?.available ?? 0}
          overview={deposits}
          onOpenTopUp={() => setTopUp(true)}
          onChanged={refreshSession}
        />

        <section className="mt-4 rounded-3xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">MATCH HISTORY</h2>
          <MatchHistory matches={matches} />
        </section>

        <Button className="mt-6" variant="secondary" onClick={logout}>
          Log out
        </Button>
      </main>

      {topUpOpen && deposits ? (
        <TopUpDialog
          overview={deposits}
          onClose={() => setTopUp(false)}
          onChanged={async () => {
            await Promise.all([loadDeposits(), refreshSession()]);
          }}
        />
      ) : null}
    </div>
  );
}

function DepositHistory({ overview }: { overview: DepositOverview | null }) {
  if (!overview || overview.deposits.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No deposits yet.</p>;
  }

  return (
    <ul className="mt-4 divide-y divide-border" aria-label="Deposits">
      {overview.deposits.map((deposit) => (
        <li key={deposit.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
          <span className="text-sm font-semibold">Deposit</span>
          <span className="text-xs text-muted-foreground">{NETWORK_INFO[deposit.network].label}</span>
          <span className="ml-auto text-sm font-semibold text-gold">
            {formatAmount("usdt", deposit.credited, { sign: true })}
          </span>
          <span className="w-full break-all text-xs text-muted-foreground">
            {new Date(deposit.createdAt).toLocaleString()} · {formatAmount("usdt", deposit.amount)} received,{" "}
            {formatAmount("usdt", deposit.fee)} fee · {deposit.txId}
          </span>
        </li>
      ))}
    </ul>
  );
}
