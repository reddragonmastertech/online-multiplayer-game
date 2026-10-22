import { Link } from "react-router-dom";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";

export function HowItWorksPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">How it works</h1>
        <ol className="mt-8 space-y-6 text-muted-foreground">
          <li>
            <h2 className="font-semibold text-foreground">1. Choose a game</h2>
            <p className="mt-2 text-sm">
              Open the lobby and pick Rock Paper Scissors. Other titles stay marked Coming soon until they
              have a real rules engine.
            </p>
          </li>
          <li>
            <h2 className="font-semibold text-foreground">2. Select a mode</h2>
            <p className="mt-2 text-sm">
              This build supports free Best of 3 (first to 2). Paid stakes and extra modes are listed but
              not enabled.
            </p>
          </li>
          <li>
            <h2 className="font-semibold text-foreground">3. Play the match</h2>
            <p className="mt-2 text-sm">
              Lock Rock, Paper, or Scissors before the timer ends. The opponent never sees your hand until
              reveal. Practice vs CPU is labeled as a bot.
            </p>
          </li>
        </ol>
        <Button className="mt-10" asChild>
          <Link to="/lobby">Explore Games</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  );
}
