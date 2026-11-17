import { ROLE_INFO, formatAmount, type AdminPlayerSummary } from "@game-platform/shared";
import { Search } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { adminSearchPlayers } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { inputClass, messageOf, when } from "./admin-ui";

export function StatusBadges({ player }: { player: Pick<AdminPlayerSummary, "role" | "status" | "usdtFrozen"> }) {
  return (
    <>
      {player.role ? (
        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">{ROLE_INFO[player.role].label}</span>
      ) : null}
      {player.status === "suspended" ? (
        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">Suspended</span>
      ) : null}
      {player.usdtFrozen ? (
        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">USDT frozen</span>
      ) : null}
    </>
  );
}

export function AdminPlayersPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [draft, setDraft] = useState(query);
  const [players, setPlayers] = useState<AdminPlayerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      setPlayers((await adminSearchPlayers(q)).players);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [query, load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setParams(draft.trim() ? { q: draft.trim() } : {});
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Players</h1>
      <form onSubmit={submit} className="flex gap-2" role="search">
        <label htmlFor="player-search" className="sr-only">
          Search players
        </label>
        <input
          id="player-search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Name, email, ID, wallet address or transaction ID"
          className={cn(inputClass, "h-10")}
        />
        <Button type="submit" className="h-10">
          <Search className="size-4" aria-hidden="true" />
          Search
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{query ? `Results for "${query}"` : "Newest players"}</p>

      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
      {players && players.length === 0 ? <p className="text-sm text-muted-foreground">No player matches.</p> : null}

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Players">
        {(players ?? []).map((player) => (
          <li key={player.id}>
            <Link to={`/admin/players/${player.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-elevated">
              <span className="font-semibold">{player.name}</span>
              <StatusBadges player={player} />
              <span className="text-xs text-muted-foreground">{player.email}</span>
              <span className="ml-auto text-sm">
                <span className="text-primary">{formatAmount("rac", player.rac)}</span> ·{" "}
                <span className="text-gold">{formatAmount("usdt", player.usdt)}</span>
              </span>
              <span className="w-full text-xs text-muted-foreground">
                Joined {when(player.createdAt)} · last seen {when(player.lastSeenAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
