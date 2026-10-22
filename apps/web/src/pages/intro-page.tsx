import { Link } from "react-router-dom";
import { GameArt } from "@/components/catalog/game-art";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { catalogGames } from "@/lib/catalog";
import { IntroPreview } from "@/components/home/intro-preview";

const steps = [
  { n: "1", title: "Choose a game", body: "Start with Rock Paper Scissors. More games will appear here as they are ready." },
  { n: "2", title: "Find an opponent", body: "Pick a free mode and search for a player, or practice against a clearly labeled CPU." },
  { n: "3", title: "Play and see results", body: "The server judges each round. Scores, timers, and outcomes are shown in the match room." },
];

const faqs = [
  {
    q: "Is it free?",
    a: "Yes. The playable RPS modes on this build are free. Paid or crypto-staked matches are not available.",
  },
  {
    q: "Who can play?",
    a: "Anyone can browse games. You will need an account before joining a live human match once matchmaking is on.",
  },
  {
    q: "How does matchmaking work?",
    a: "Players who choose the same game and mode are paired by the server. Online pairing is not live in this build yet.",
  },
  {
    q: "Are cash games available in my location?",
    a: "Not on this build. Real-money or USDT play stays off until payments and eligibility are in place.",
  },
  {
    q: "How do I get help?",
    a: "Use Support in the footer. Match chat, when enabled, is only between the two players in a room.",
  },
];

export function IntroPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <h1 className="font-[Rajdhani,Inter,sans-serif] text-5xl font-bold leading-tight sm:text-6xl">
              Your arena.
              <span className="block text-primary">Your next challenge.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Challenge players in short skill games. Rock Paper Scissors is live; chess and 4 × 4 are on the way.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/lobby">Explore Games</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/how-it-works">How It Works</Link>
              </Button>
            </div>
          </div>
          <IntroPreview />
        </section>

        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">Find your game</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Jump into a match when a game is marked available.
              </p>
            </div>
            <Link to="/lobby" className="text-sm font-semibold text-primary">
              View all games
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {catalogGames.map((game) => (
              <article key={game.id} className="overflow-hidden rounded-3xl border border-border bg-card">
                <GameArt gameId={game.id} className="h-28" />
                <div className="p-4">
                  <h3 className="font-semibold">{game.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{game.blurb}</p>
                  <p className="mt-3 text-xs font-semibold tracking-wide text-primary">
                    {game.availability === "available" ? "Available" : "Coming soon"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">How it works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-bold text-primary">{step.n}</p>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 rounded-3xl border border-border bg-card p-6 sm:p-8">
          <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">Fair play</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Hands are hidden until both players lock in. The API, not the browser, judges rounds, timers, and
            results. Rankings and paid modes stay off this build so we do not show numbers we cannot back.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">FAQ</h2>
          <dl className="mt-6 space-y-4">
            {faqs.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-card p-5">
                <dt className="font-semibold">{item.q}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
