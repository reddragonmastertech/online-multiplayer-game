import {
  CURRENCY_RULES,
  MATCH_RULES,
  formatAmount,
  houseCutPercent,
  stakesFor,
  winnerTakes,
  type Currency,
  type QueueEntry,
} from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GameArt } from "@/components/catalog/game-art";
import { MatchClosed } from "@/components/match/match-closed";
import { Button } from "@/components/ui/button";
import { findCatalogGame } from "@/lib/catalog";
import { availableIn, useSessionStore } from "@/stores/session-store";
import { useQueueStore } from "@/stores/queue-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const currencyTabs: { id: Currency; title: string; detail: string }[] = [
  { id: "rac", title: "RAC", detail: "Free play" },
  { id: "usdt", title: "USDT", detail: "Paid play" },
];

const modes = [
  { id: "first-to-2", title: "Best of 3", detail: "First to win 2 rounds takes the match.", live: true },
  { id: "quick", title: "Quick Match", detail: "A single round. Not on this build.", live: false },
  { id: "best-of-5", title: "Best of 5", detail: "First to win 3 rounds. Not on this build.", live: false },
  { id: "private", title: "Private Room", detail: "Invite a friend. Not on this build.", live: false },
] as const;

function useElapsedSeconds(since: string | null) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!since) {
      setSeconds(0);
      return;
    }

    const started = new Date(since).getTime();
    const tick = () => setSeconds(Math.max(0, Math.round((Date.now() - started) / 1000)));

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [since]);

  return seconds;
}

export function GameLobbyPage() {
  const { gameId = "" } = useParams();
  const navigate = useNavigate();
  const game = findCatalogGame(gameId);
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("first-to-2");
  const [currency, setCurrency] = useState<Currency>("rac");
  const [stake, setStake] = useState<number>(stakesFor("rac")[0] ?? 1);
  const user = useSessionStore((state) => state.user);
  const wallets = useSessionStore((state) => state.wallets);
  const openAuth = useUiStore((state) => state.openAuth);

  const queueStatus = useQueueStore((state) => state.status);
  const queuedAt = useQueueStore((state) => state.queuedAt);
  const queueError = useQueueStore((state) => state.error);
  const foundMatchId = useQueueStore((state) => state.matchId);
  const joinQueue = useQueueStore((state) => state.join);
  const leaveQueue = useQueueStore((state) => state.leave);
  const resetQueue = useQueueStore((state) => state.reset);

  const elapsed = useElapsedSeconds(queueStatus === "searching" ? queuedAt : null);
  const available = availableIn(wallets, currency);
  const rules = CURRENCY_RULES[currency];
  const money = (amount: number) => formatAmount(currency, amount);

  useEffect(() => {
    if (!user) resetQueue();
  }, [user, resetQueue]);

  // The server has already seated both players and started their clock.
  useEffect(() => {
    if (queueStatus !== "found" || !foundMatchId) return;
    resetQueue();
    void navigate(`/room/${foundMatchId}`, { replace: true });
  }, [queueStatus, foundMatchId, navigate, resetQueue]);

  if (!game) {
    return <MatchClosed title="Game not found" detail="That game is not in the catalog." backTo="/lobby" />;
  }

  if (game.availability !== "available") {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-3xl font-bold">{game.name}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Coming soon. This game is not playable yet.</p>
          <Button className="mt-6" asChild>
            <Link to="/lobby">Back to games</Link>
          </Button>
        </section>
      </div>
    );
  }

  const selected = modes.find((item) => item.id === mode);
  const canAffordStake = available >= stake;
  const searching = queueStatus === "searching";
  const found = queueStatus === "found";

  const blockedReason = !user
    ? "Log in to use JOIN NOW."
    : !selected?.live
      ? "That mode is not on this build."
      : !canAffordStake
        ? `You need ${money(stake)} available. You have ${money(available)}.`
        : null;

  function handleJoin() {
    if (!user) {
      openAuth("login");
      return;
    }

    const entry: QueueEntry = {
      gameId: "rps",
      mode: "first-to-2",
      currency,
      stake,
    };

    joinQueue(entry);
  }

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">
          <Link to="/lobby" className="hover:text-foreground">
            Lobby
          </Link>
          <span aria-hidden="true"> / </span>
          {game.name}
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <h1 className="font-display text-4xl font-bold">{game.name}</h1>
            <p className="mt-2 text-muted-foreground">{game.blurb}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <Link to="/how-it-works" className="text-primary">
                How to play
              </Link>
            </p>

            <h2 className="mt-8 text-sm font-semibold tracking-[0.16em] text-muted-foreground">
              CHOOSE A MATCH MODE
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.live || searching}
                  onClick={() => setMode(item.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === item.id && item.live
                      ? "border-primary bg-elevated"
                      : "border-border bg-card",
                    (!item.live || searching) && "opacity-60",
                  )}
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  {item.live ? null : (
                    <p className="mt-2 text-xs font-semibold text-gold">Coming soon</p>
                  )}
                </button>
              ))}
            </div>

            <h2 className="mt-8 text-sm font-semibold tracking-[0.16em] text-muted-foreground">
              FREE OR PAID
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Currency">
              {currencyTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="radio"
                  aria-checked={currency === tab.id}
                  disabled={searching}
                  onClick={() => {
                    if (tab.id === currency) return;
                    setCurrency(tab.id);
                    setStake(stakesFor(tab.id)[0] ?? 0);
                  }}
                  className={cn(
                    "rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    currency === tab.id ? "border-primary bg-elevated" : "border-border bg-card",
                    searching && "opacity-60",
                  )}
                >
                  <p className="font-display text-2xl font-bold">{tab.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tab.detail}
                    {user ? ` · ${formatAmount(tab.id, availableIn(wallets, tab.id))}` : ""}
                  </p>
                </button>
              ))}
            </div>

            <h2 className="mt-8 text-sm font-semibold tracking-[0.16em] text-muted-foreground">
              CHOOSE YOUR STAKE
            </h2>
            <div
              className="mt-3 grid gap-3 sm:grid-cols-3"
              role="radiogroup"
              aria-label={`${rules.label} stake`}
            >
              {stakesFor(currency).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  role="radio"
                  aria-checked={stake === amount}
                  disabled={searching}
                  onClick={() => setStake(amount)}
                  className={cn(
                    "rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    stake === amount ? "border-primary bg-elevated" : "border-border bg-card",
                    searching && "opacity-60",
                  )}
                >
                  <p className="font-display text-2xl font-bold">{money(amount)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Winner takes {money(winnerTakes(currency, amount))}
                  </p>
                  {user && available < amount ? (
                    <p className="mt-2 text-xs font-semibold text-danger">Not enough {rules.label}</p>
                  ) : null}
                </button>
              ))}
            </div>
            {currency === "rac" ? (
              <p className="mt-3 text-sm text-muted-foreground">
                RAC is play-only arena credit. It has no cash value and cannot be withdrawn. Joining
                locks your stake until the match settles; leaving the queue returns it.
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>
                  USDT is the paid version, played for real money. The house keeps{" "}
                  {houseCutPercent("usdt")}% of the pot: on a {formatAmount("usdt", stakesFor("usdt")[2] ?? 0)}{" "}
                  match the winner receives {formatAmount("usdt", winnerTakes("usdt", stakesFor("usdt")[2] ?? 0))}.
                  Joining locks your stake until the match settles; leaving the queue returns it in full.
                </p>
                <p>RAC and USDT are separate balances. Neither can be converted into the other.</p>
              </div>
            )}

            {found ? (
              <div className="mt-6 rounded-2xl border border-primary bg-elevated p-5">
                <p className="font-semibold">Opponent found</p>
                <p className="mt-2 text-sm text-muted-foreground">Opening the match room…</p>
              </div>
            ) : searching ? (
              <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                <p className="font-semibold">Looking for an opponent…</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {money(stake)} locked · searching for {elapsed}s
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={leaveQueue}>
                    Cancel Search
                  </Button>
                  {rules.cpuPractice ? (
                    <Button variant="ghost" asChild>
                      <Link to="/vs/1-rac">Practice vs CPU instead</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                {user && currency === "usdt" && !canAffordStake ? (
                  <Button size="lg" asChild>
                    <Link to="/account?topup=usdt">Top up USDT</Link>
                  </Button>
                ) : (
                  <Button size="lg" disabled={Boolean(user) && Boolean(blockedReason)} onClick={handleJoin}>
                    JOIN NOW
                  </Button>
                )}
                {rules.cpuPractice ? (
                  <Button size="lg" variant="secondary" asChild>
                    <Link to="/vs/1-rac">Practice vs CPU</Link>
                  </Button>
                ) : null}
              </div>
            )}

            {queueError ? (
              <p role="status" className="mt-3 text-sm font-semibold text-danger">
                {queueError}
              </p>
            ) : null}

            {user ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Signed in as {user.name} · {money(available)} available
                {blockedReason && !searching && !found ? ` · ${blockedReason}` : ""}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Log in to use JOIN NOW.</p>
            )}
          </div>

          <aside className="space-y-4">
            <GameArt gameId="rps" className="h-40" />
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">HOW TO PLAY</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Rock beats Scissors, Paper beats Rock, Scissors beats Paper.</li>
                <li>First to {MATCH_RULES.winScore} wins. Draws score nothing.</li>
                <li>{MATCH_RULES.roundSeconds}s to lock a hand. A missed lock is chosen at random.</li>
              </ul>
            </section>
            <section className="rounded-2xl border border-dashed border-border bg-card p-4">
              <h2 className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">LIVE RPS MATCHES</h2>
              <p className="mt-3 text-sm text-muted-foreground">No public matches are live right now.</p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
