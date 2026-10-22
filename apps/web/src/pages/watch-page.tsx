import { Link } from "react-router-dom";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";

export function WatchPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">Watch</h1>
        <p className="mt-2 text-muted-foreground">Public matches you can spectate will show up here.</p>
        <div className="mt-8 rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No public matches are live right now.</p>
          <Button className="mt-4" asChild>
            <Link to="/lobby">Start Playing</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
