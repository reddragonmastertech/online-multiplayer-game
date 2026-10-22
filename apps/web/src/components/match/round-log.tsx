import type { MatchLogEntry } from "./match-types";

export function RoundLog({ entries }: { entries: MatchLogEntry[] }) {
  return (
    <section className="rounded-2xl border border-[#30425B] bg-[#121D2D] p-4">
      <h3 className="text-xs font-semibold tracking-[0.16em] text-[#B1C0D2]">ROUND HISTORY</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-[#B1C0D2]/80">No rounds yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li key={entry.round} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-[#EBC26A]">R{entry.round}</span>
              <p className="min-w-0 flex-1 text-sm text-[#F5F8FD]">{entry.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
