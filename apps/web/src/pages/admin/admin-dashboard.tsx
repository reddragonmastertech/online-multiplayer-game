import { formatAmount, type AdminDashboard } from "@game-platform/shared";
import { AlertTriangle, OctagonAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { adminDashboardRequest } from "@/lib/admin-api";
import { cn } from "@/lib/utils";
import { AdminSection, Stat, messageOf } from "./admin-ui";

const houseLabel: Record<string, string> = {
  match_cut: "Match cuts (10%)",
  deposit_fee: "Deposit fees (1%)",
  withdrawal_fee: "Withdrawal fees (1%)",
};

const usdt = (amount: number) => formatAmount("usdt", amount);

export function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminDashboardRequest());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error) return <p role="alert" className="text-sm font-semibold text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const today = (currency: "rac" | "usdt") => data.matches.today.find((row) => row.currency === currency);
  const totals = data.money.house.reduce(
    (sum, row) => ({ today: sum.today + row.today, week: sum.week + row.week, total: sum.total + row.total }),
    { today: 0, week: 0, total: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <span className="text-xs text-muted-foreground">Updated {new Date(data.generatedAt).toLocaleTimeString()}</span>
        <Button className="ml-auto" size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {data.alerts.length > 0 ? (
        <ul className="space-y-2" aria-label="Alerts">
          {data.alerts.map((alert) => (
            <li
              key={alert.message}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                alert.level === "error" ? "bg-danger/15 text-danger" : "bg-gold/15 text-gold",
              )}
            >
              {alert.level === "error" ? (
                <OctagonAlert className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              )}
              {alert.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">No alerts. The books add up.</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Players" value={data.players.total} detail={`+${data.players.newToday} today · +${data.players.newWeek} this week`} />
        <Stat label="Online now" value={data.players.onlineNow} detail={`${data.matches.queueWaiting} waiting in the queue`} />
        <Stat label="Live matches" value={data.matches.live} />
        <Stat
          label="Matches today"
          value={(today("rac")?.count ?? 0) + (today("usdt")?.count ?? 0)}
          detail={`${today("usdt")?.count ?? 0} USDT · ${usdt(today("usdt")?.volume ?? 0)} staked`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="USDT held for players"
          tone="gold"
          value={usdt(data.money.usdtHeld.available + data.money.usdtHeld.locked)}
          detail={`${usdt(data.money.usdtHeld.locked)} locked`}
        />
        <Stat label="Deposits today" value={usdt(data.money.depositsToday.amount)} detail={`${data.money.depositsToday.count} deposit(s)`} />
        <Stat
          label="Withdrawals waiting"
          tone={data.money.withdrawalsWaiting.count > 0 ? "gold" : undefined}
          value={data.money.withdrawalsWaiting.count}
          detail={
            <Link to="/admin/withdrawals" className="text-primary">
              {usdt(data.money.withdrawalsWaiting.amount)} requested
            </Link>
          }
        />
        <Stat
          label="Paid out today"
          value={usdt(data.money.withdrawalsPaidToday.payout)}
          detail={`${data.money.withdrawalsPaidToday.count} withdrawal(s)`}
        />
      </div>

      <AdminSection title="House earnings (USDT)">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Kind</th>
              <th className="py-1 text-right font-medium">Today</th>
              <th className="py-1 text-right font-medium">7 days</th>
              <th className="py-1 text-right font-medium">All time</th>
            </tr>
          </thead>
          <tbody>
            {data.money.house.map((row) => (
              <tr key={row.kind} className="border-t border-border">
                <td className="py-1.5">{houseLabel[row.kind] ?? row.kind}</td>
                <td className="py-1.5 text-right">{usdt(row.today)}</td>
                <td className="py-1.5 text-right">{usdt(row.week)}</td>
                <td className="py-1.5 text-right">{usdt(row.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold text-gold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right">{usdt(totals.today)}</td>
              <td className="py-1.5 text-right">{usdt(totals.week)}</td>
              <td className="py-1.5 text-right">{usdt(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </AdminSection>
    </div>
  );
}
