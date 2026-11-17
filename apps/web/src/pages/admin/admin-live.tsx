import { formatAmount, type AdminLive, type AdminMatchSummary } from "@game-platform/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { adminLiveRequest, adminMatchesRequest } from "@/lib/admin-api";
import { AdminSection, inputClass, messageOf, when } from "./admin-ui";

export function MatchLine({ match }: { match: AdminMatchSummary }) {
  const [a, b] = match.players;
  return (
    <Link to={`/admin/matches/${match.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-elevated">
      <span className="font-semibold">
        {a?.name ?? "?"} {a?.score ?? 0} – {b?.score ?? 0} {b?.name ?? "?"}
      </span>
      <span className="text-muted-foreground">{formatAmount(match.currency, match.stake)} stake</span>
      <span className={match.live ? "font-semibold text-primary" : "text-muted-foreground"}>
        {match.live ? `live · round ${match.round}` : match.status}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">{when(match.finishedAt ?? match.createdAt)}</span>
    </Link>
  );
}

export function AdminLivePage() {
  const [live, setLive] = useState<AdminLive | null>(null);
  const [results, setResults] = useState<AdminMatchSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLive(await adminLiveRequest());
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function search(event: FormEvent) {
    event.preventDefault();
    try {
      setResults((await adminMatchesRequest(query.trim())).matches);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Live</h1>
      <p className="text-sm text-muted-foreground">Updates every 5 seconds. Open a match to see its rounds or void it.</p>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

      <AdminSection title={`Matches in progress (${live?.matches.length ?? 0})`}>
        {live && live.matches.length === 0 ? <p className="text-sm text-muted-foreground">No match is running.</p> : null}
        <ul className="-mx-4 divide-y divide-border" aria-label="Live matches">
          {(live?.matches ?? []).map((match) => (
            <li key={match.id}>
              <MatchLine match={match} />
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title={`Waiting in the queue (${live?.queue.length ?? 0})`}>
        {live && live.queue.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is waiting.</p> : null}
        <ul className="space-y-1 text-sm" aria-label="Queue">
          {(live?.queue ?? []).map((ticket) => (
            <li key={ticket.userId}>
              <Link to={`/admin/players/${ticket.userId}`} className="font-semibold text-primary">
                {ticket.name}
              </Link>{" "}
              · {formatAmount(ticket.currency, ticket.stake)} · waiting since {new Date(ticket.queuedAt).toLocaleTimeString()}
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title="Find a match">
        <form onSubmit={search} className="flex gap-2" role="search">
          <label htmlFor="match-search" className="sr-only">
            Search matches
          </label>
          <input
            id="match-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Player name or match ID (empty for the latest)"
            className={inputClass}
          />
          <Button type="submit" size="sm" className="h-9">
            Search
          </Button>
        </form>
        {results ? (
          <ul className="-mx-4 mt-3 divide-y divide-border" aria-label="Match results">
            {results.map((match) => (
              <li key={match.id}>
                <MatchLine match={match} />
              </li>
            ))}
          </ul>
        ) : null}
        {results && results.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No match found.</p> : null}
      </AdminSection>
    </div>
  );
}
