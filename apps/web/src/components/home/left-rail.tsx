import { Info, Shield, Trophy } from "lucide-react";
import { panelClass, recentWinners, type Currency } from "./lobby-data";
import { Portrait } from "./portrait";
import { cn } from "@/lib/utils";

function currencyClass(currency: Currency) {
  return currency === "rac" ? "text-emerald-300" : "text-amber-300";
}

export function LeftRail() {
  return (
    <aside className="flex flex-col gap-3 p-3 xl:min-h-0 xl:overflow-y-auto">
      <section className={cn(panelClass, "flex min-h-72 flex-1 flex-col p-4")}>
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-violet-500/20 text-violet-200">
            <Shield className="size-4" aria-hidden="true" />
          </span>
          <h2 className="text-xs font-semibold tracking-[0.16em] text-white/90">
            SEASONAL RANKINGS
          </h2>
          <button
            type="button"
            className="ml-auto grid size-6 place-items-center rounded-full border border-white/15 text-white/50"
            aria-label="About seasonal rankings"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="m-auto max-w-[16rem] text-center text-sm text-white/45">
          Seasonal competition is currently paused.
        </p>
      </section>

      <section className={cn(panelClass, "p-3")}>
        <div className="mb-3 flex items-center gap-2 px-1">
          <Trophy className="size-4 text-[#f3c969]" aria-hidden="true" />
          <h2 className="text-xs font-semibold tracking-[0.16em] text-white/90">
            RECENT WINNERS
          </h2>
        </div>
        <ul className="space-y-2">
          {recentWinners.map((winner) => (
            <li
              key={winner.name}
              className="flex items-center gap-2 rounded-xl bg-black/30 px-2 py-1.5"
            >
              <Portrait
                id={winner.avatar}
                name={winner.name}
                className="size-8 shrink-0 rounded-full"
              />
              <p className="min-w-0 flex-1 truncate text-sm">{winner.name}</p>
              <span
                className={cn(
                  "rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold",
                  currencyClass(winner.currency),
                )}
              >
                {winner.currency === "rac" ? "RAC" : "USDT"}
              </span>
              <span className={cn("text-xs font-semibold", currencyClass(winner.currency))}>
                {winner.amount}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
