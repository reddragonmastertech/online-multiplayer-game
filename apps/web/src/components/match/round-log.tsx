import type { MatchLogEntry } from "./match-types";

export function RoundLog({ entries }: { entries: MatchLogEntry[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">ROUND HISTORY</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground/80">No rounds yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li key={entry.round} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-gold">R{entry.round}</span>
              <p className="min-w-0 flex-1 text-sm text-foreground">{entry.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
