import { MATCH_RULES } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GameArt } from "@/components/catalog/game-art";
import { MatchClosed } from "@/components/match/match-closed";
import { Button } from "@/components/ui/button";
import { findCatalogGame } from "@/lib/catalog";
import { racAvailable, useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const modes = [
  { id: "first-to-2", title: "Best of 3", detail: "First to win 2 rounds takes the match.", live: true },
  { id: "quick", title: "Quick Match", detail: "A single round. Not on this build.", live: false },
  { id: "best-of-5", title: "Best of 5", detail: "First to win 3 rounds. Not on this build.", live: false },
  { id: "private", title: "Private Room", detail: "Invite a friend. Not on this build.", live: false },
] as const;

export function GameLobbyPage() {
  const { gameId = "" } = useParams();
  const game = findCatalogGame(gameId);
  const [mode, setMode] = useState<(typeof modes)[number]["id"]>("first-to-2");
  const [searching, setSearching] = useState(false);
  const user = useSessionStore((state) => state.user);
  const wallets = useSessionStore((state) => state.wallets);
  const openAuth = useUiStore((state) => state.openAuth);

  useEffect(() => {
    if (!user) {
      setSearching(false);
    }
  }, [user]);

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
                  disabled={!item.live}
                  onClick={() => {
                    setMode(item.id);
                    setSearching(false);
                  }}
                  className={cn(
                    "rounded-2xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === item.id && item.live
                      ? "border-primary bg-elevated"
                      : "border-border bg-card",
                    !item.live && "opacity-60",
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

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary bg-elevated p-4">
                <p className="font-semibold">Free Play</p>
                <p className="mt-1 text-sm text-muted-foreground">Casual matches. No stake.</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 opacity-70">
                <p className="font-semibold">Paid Matches</p>
                <p className="mt-1 text-sm text-muted-foreground">Not available on this build.</p>
              </div>
            </div>

            {searching ? (
              <div className="mt-6 rounded-2xl border border-border bg-card p-5">
                <p className="font-semibold">Looking for an opponent…</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  You are signed in, but online pairing is not live yet, so this search cannot find a
                  human player. Practice against the CPU is labeled as a bot.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/vs/1-rac">Practice vs CPU</Link>
                  </Button>
                  <Button variant="secondary" onClick={() => setSearching(false)}>
                    Cancel Search
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  disabled={!selected?.live}
                  onClick={() => {
                    if (!user) {
                      openAuth("login");
                      return;
                    }
                    setSearching(true);
                  }}
                >
                  JOIN NOW
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link to="/vs/1-rac">Practice vs CPU</Link>
                </Button>
              </div>
            )}
            {user ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Signed in as {user.name} · {racAvailable(wallets)} RAC
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
