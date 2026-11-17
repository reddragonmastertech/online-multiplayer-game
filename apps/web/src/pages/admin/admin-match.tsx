import { can, formatAmount, type AdminMatchDetail } from "@game-platform/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminMatchRequest, adminVoidMatch, useAdminSession } from "@/lib/admin-api";
import { ActionForm, AdminSection, messageOf, when } from "./admin-ui";

const outcomeLabel = (outcome: string | null, a: string, b: string) =>
  outcome === "a" ? `${a} wins` : outcome === "b" ? `${b} wins` : outcome === "draw" ? "Draw" : "—";

export function AdminMatchPage() {
  const { id = "" } = useParams();
  const role = useAdminSession((state) => state.session?.role);
  const [match, setMatch] = useState<AdminMatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMatch(await adminMatchRequest(id));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert" className="text-sm font-semibold text-danger">{error}</p>;
  if (!match) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const a = match.players.find((player) => player.seat === "a");
  const b = match.players.find((player) => player.seat === "b");
  const winner = match.winnerSeat === "a" ? a : match.winnerSeat === "b" ? b : undefined;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        <Link to="/admin/live" className="hover:text-foreground">
          Live
        </Link>{" "}
        / Match
      </p>
      <h1 className="font-display text-3xl font-bold">
        {a?.name} {a?.score} – {b?.score} {b?.name}
      </h1>
      <p className="text-sm text-muted-foreground">
        {formatAmount(match.currency, match.stake)} stake · {match.live ? `live, round ${match.round}` : match.status}
        {winner ? ` · ${winner.name} won` : ""} · started {when(match.createdAt)}
        {match.finishedAt ? ` · ended ${when(match.finishedAt)}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        ID <code>{match.id}</code> · players{" "}
        {match.players.map((player, index) => (
          <span key={player.userId}>
            {index > 0 ? ", " : ""}
            <Link to={`/admin/players/${player.userId}`} className="text-primary">
              {player.name}
            </Link>
          </span>
        ))}
      </p>

      {match.live && can(role, "players.moderate") ? (
        <ActionForm
          title="Void this match (both stakes returned in full, no winner)"
          submitLabel="Void match"
          danger
          onSubmit={async (reason) => {
            setMatch(await adminVoidMatch(id, reason));
          }}
        />
      ) : null}

      <AdminSection title="Rounds">
        <p className="mb-2 text-xs text-muted-foreground">A round appears once it resolves; a hand being chosen is never shown.</p>
        {match.rounds.length === 0 ? <p className="text-sm text-muted-foreground">No round has finished yet.</p> : null}
        <table className="w-full text-sm">
          <tbody>
            {match.rounds.map((round) => (
              <tr key={round.round} className="border-t border-border first:border-0">
                <td className="py-1.5 font-semibold">R{round.round}</td>
                <td className="py-1.5">
                  {a?.name}: {round.handA ?? "—"}
                </td>
                <td className="py-1.5">
                  {b?.name}: {round.handB ?? "—"}
                </td>
                <td className="py-1.5 text-right">{outcomeLabel(round.outcome, a?.name ?? "A", b?.name ?? "B")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminSection>
    </div>
  );
}
