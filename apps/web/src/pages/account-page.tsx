import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { panelClass, type Currency } from "@/components/home/lobby-data";
import { Portrait } from "@/components/home/portrait";
import { cn } from "@/lib/utils";

const profile = {
  name: "NovaAce",
  avatar: 64,
  rank: "Gold III",
  since: "March 2026",
  email: "nova@arena.com",
};

const balances: { label: string; amount: string; note: string; currency: Currency }[] = [
  { label: "RAC BALANCE", amount: "248.50", note: "Play tokens", currency: "rac" },
  { label: "USDT BALANCE", amount: "12.40", note: "Match winnings", currency: "usdt" },
];

const stats = [
  { label: "MATCHES", value: "86" },
  { label: "WINS", value: "51" },
  { label: "WIN RATE", value: "59%" },
  { label: "BEST STREAK", value: "7" },
];

const history: {
  id: string;
  opponent: string;
  avatar: number;
  result: "Win" | "Loss" | "Draw";
  score: string;
  stake: string;
  currency: Currency;
}[] = [
  { id: "h1", opponent: "cobra8481", avatar: 18, result: "Win", score: "2–0", stake: "5 RAC", currency: "rac" },
  { id: "h2", opponent: "wealth", avatar: 41, result: "Loss", score: "1–2", stake: "0.2 USDT", currency: "usdt" },
  { id: "h3", opponent: "young", avatar: 22, result: "Win", score: "2–1", stake: "1 RAC", currency: "rac" },
  { id: "h4", opponent: "ghost", avatar: 60, result: "Draw", score: "1–1", stake: "10 RAC", currency: "rac" },
  { id: "h5", opponent: "Liam", avatar: 7, result: "Win", score: "2–0", stake: "0.1 USDT", currency: "usdt" },
];

function resultClass(result: (typeof history)[number]["result"]) {
  if (result === "Win") return "bg-emerald-400/15 text-emerald-300";
  if (result === "Loss") return "bg-rose-400/15 text-rose-300";
  return "bg-white/10 text-white/70";
}

export function AccountPage() {
  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#121a2b] px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c969]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Lobby
          </Link>
          <h2 className="text-xs font-semibold tracking-[0.18em] text-white/75">ACCOUNT</h2>
        </div>

        <section className={cn(panelClass, "overflow-hidden")}>
          <div className="h-24 bg-gradient-to-r from-[#1d4ed8] via-[#122033] to-[#3a2e14]" />
          <div className="-mt-10 flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-end">
            <Portrait
              id={profile.avatar}
              name={profile.name}
              className="size-20 rounded-2xl ring-2 ring-[#f3c969]"
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold leading-none">
                {profile.name}
              </h3>
              <p className="mt-2 text-sm text-[#e7c56a]">
                {profile.rank} · Member since {profile.since}
              </p>
            </div>
            <p className="text-sm text-white/45">{profile.email}</p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {balances.map((balance) => {
            const usdt = balance.currency === "usdt";
            return (
              <article
                key={balance.label}
                className={cn(
                  "rounded-2xl border p-4",
                  usdt
                    ? "border-amber-300/50 bg-gradient-to-b from-[#3a2e14] to-[#14110c]"
                    : "border-emerald-400/45 bg-gradient-to-b from-[#143026] to-[#0b1612]",
                )}
              >
                <p className={cn("text-[11px] font-semibold tracking-[0.16em]", usdt ? "text-amber-200" : "text-emerald-300")}>
                  {balance.label}
                </p>
                <p className="mt-2 font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">{balance.amount}</p>
                <p className="mt-1 text-xs text-white/45">{balance.note}</p>
              </article>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className={cn(panelClass, "px-3 py-4 text-center")}>
              <p className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">{stat.value}</p>
              <p className="mt-1 text-[11px] font-semibold tracking-[0.14em] text-white/45">{stat.label}</p>
            </article>
          ))}
        </div>

        <section className={cn(panelClass, "p-4")}>
          <h3 className="text-xs font-semibold tracking-[0.16em] text-white/75">MATCH HISTORY</h3>
          <ul className="mt-3 space-y-2">
            {history.map((match) => (
              <li key={match.id} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5">
                <Portrait id={match.avatar} name={match.opponent} className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">vs {match.opponent}</p>
                  <p className="text-[11px] text-white/40">
                    {match.score} · {match.stake}
                  </p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", resultClass(match.result))}>
                  {match.result}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
