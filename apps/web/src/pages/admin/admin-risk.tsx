import { formatAmount, type RiskReport } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminRiskRequest } from "@/lib/admin-api";
import { AdminSection, messageOf, when } from "./admin-ui";

const player = (userId: string, name: string) => (
  <Link to={`/admin/players/${userId}`} className="font-semibold text-primary">
    {name}
  </Link>
);

export function AdminRiskPage() {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminRiskRequest()
      .then(setReport)
      .catch((cause) => setError(messageOf(cause)));
  }, []);

  if (error) return <p role="alert" className="text-sm font-semibold text-danger">{error}</p>;
  if (!report) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const t = report.thresholds;

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="font-display text-3xl font-bold">Risk</h1>
      <p className="text-sm text-muted-foreground">
        The last {report.windowDays} days. Each flag is a reason to look, not proof: families and offices share an IP,
        and friends play each other. Nothing here blocks anyone; open the player to act.
      </p>

      <AdminSection title={`Possible chip dumping (${report.collusion.length})`}>
        <p className="mb-2 text-xs text-muted-foreground">
          Two players who met at least {t.collusionMinMatches} times in USDT with one winning {Math.round(t.collusionMinShare * 100)}% or
          more. Worst first: a shared IP, then the most money moved.
        </p>
        {report.collusion.length === 0 ? <p className="text-sm text-muted-foreground">Nothing flagged.</p> : null}
        <ul className="space-y-2 text-sm" aria-label="Collusion flags">
          {report.collusion.map((flag) => (
            <li key={`${flag.winner.userId}-${flag.loser.userId}`} className="rounded-xl border border-border p-3">
              {player(flag.winner.userId, flag.winner.name)} beat {player(flag.loser.userId, flag.loser.name)}{" "}
              {flag.winnerWins} of {flag.matches} times · {formatAmount("usdt", flag.netFlow, { sign: true })} moved
              {flag.sharedIp ? (
                <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">shared IP</span>
              ) : null}
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title={`Unusual win rates (${report.winRates.length})`}>
        <p className="mb-2 text-xs text-muted-foreground">
          Rock Paper Scissors is chance. {Math.round(t.winRateMinShare * 100)}%+ over {t.winRateMinMatches}+ USDT matches almost never
          happens by luck, so it can mean a bot or an exploit.
        </p>
        {report.winRates.length === 0 ? <p className="text-sm text-muted-foreground">Nothing flagged.</p> : null}
        <ul className="space-y-1 text-sm" aria-label="Win rate flags">
          {report.winRates.map((flag) => (
            <li key={flag.userId}>
              {player(flag.userId, flag.name)} won {flag.wins} of {flag.matches} ({Math.round(flag.winRate * 100)}%)
            </li>
          ))}
        </ul>
      </AdminSection>

      <AdminSection title={`Accounts sharing an IP (${report.ipClusters.length})`}>
        {report.ipClusters.length === 0 ? <p className="text-sm text-muted-foreground">Nothing flagged.</p> : null}
        <ul className="space-y-2 text-sm" aria-label="Shared IP addresses">
          {report.ipClusters.map((cluster) => (
            <li key={cluster.ip}>
              <code>{cluster.ip}</code> · {cluster.accounts.length} accounts · last seen {when(cluster.lastSeen)}
              <span className="block">
                {cluster.accounts.map((account, index) => (
                  <span key={account.userId}>
                    {index > 0 ? ", " : ""}
                    {player(account.userId, account.name)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </AdminSection>
    </div>
  );
}
