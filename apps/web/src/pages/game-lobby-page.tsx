import { MATCH_RULES, type QueueEntry } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GameArt } from "@/components/catalog/game-art";
import { MatchClosed } from "@/components/match/match-closed";
import { Button } from "@/components/ui/button";
import { findCatalogGame } from "@/lib/catalog";
import { racAvailable, useSessionStore } from "@/stores/session-store";
import { useQueueStore } from "@/stores/queue-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

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
  const [stake, setStake] = useState<number>(MATCH_RULES.racStakes[0]);
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
  const available = racAvailable(wallets);

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
          <h1 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">{game.name}</h1>
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
        ? `You need ${stake} RAC available. You have ${available} RAC.`
        : null;

  function handleJoin() {
    if (!user) {
      openAuth("login");
      return;
    }

    const entry: QueueEntry = {
      gameId: "rps",
      mode: "first-to-2",
      currency: "rac",
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
            <h1 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">{game.name}</h1>
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
              CHOOSE YOUR STAKE
            </h2>
            <div
              className="mt-3 grid gap-3 sm:grid-cols-3"
              role="radiogroup"
              aria-label="RAC stake"
            >
              {MATCH_RULES.racStakes.map((amount) => (
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
                  <p className="font-[Rajdhani,Inter,sans-serif] text-2xl font-bold">
                    {amount} RAC
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Winner takes {amount * 2} RAC
                  </p>
                  {user && available < amount ? (
                    <p className="mt-2 text-xs font-semibold text-danger">Not enough RAC</p>
                  ) : null}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              RAC is play-only arena credit. It has no cash value and cannot be withdrawn. Joining
              locks your stake until the match settles; leaving the queue returns it.
            </p>

            {found ? (
              <div className="mt-6 rounded-2xl border border-primary bg-elevated p-5">
                <p className="font-semibold">Opponent found</p>
                <p className="mt-2 text-sm text-muted-foreground">Opening the match room…</p>
              </div>
            ) : searching ? (
              <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                <p className="font-semibold">Looking for an opponent…</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {stake} RAC locked · searching for {elapsed}s
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={leaveQueue}>
                    Cancel Search
                  </Button>
                  <Button variant="ghost" asChild>
                    <Link to="/vs/1-rac">Practice vs CPU instead</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" disabled={Boolean(user) && Boolean(blockedReason)} onClick={handleJoin}>
                  JOIN NOW
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link to="/vs/1-rac">Practice vs CPU</Link>
                </Button>
              </div>
            )}

            {queueError ? (
              <p role="status" className="mt-3 text-sm font-semibold text-danger">
                {queueError}
              </p>
            ) : null}

            {user ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Signed in as {user.name} · {available} RAC available
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
