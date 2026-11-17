import { ArrowLeft, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PlayerSeat } from "./player-seat";
import { RoundLog } from "./round-log";
import type { MatchView } from "./match-types";

export function MatchShell({
  view,
  board,
  chat,
  onPlayAgain,
}: {
  view: MatchView;
  board: ReactNode;
  /** Players-only chat. Sits below the board so it never pushes the controls down on mobile. */
  chat?: ReactNode;
  onPlayAgain?: () => void;
}) {
  const showTimer = Boolean(view.showCountdown && view.secondsLeft !== undefined);

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={view.backTo}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {view.backLabel ?? "Lobby"}
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                {view.gameName} · {view.modeLabel}
              </p>
              <h2 className="truncate font-display text-2xl font-bold tracking-wide sm:text-3xl">
                {view.title}
              </h2>
            </div>
          </div>
          {view.role === "spectator" ? (
            <span
              role="status"
              className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-danger"
            >
              <Eye className="size-3" aria-hidden="true" />
              SPECTATING
            </span>
          ) : view.badge ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-gold">
              {view.badge}
            </span>
          ) : null}
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
          <div className="order-2 lg:order-1">
            <PlayerSeat seat={view.left} />
          </div>

          <section className="order-1 overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_center,var(--elevated)_0%,var(--background)_72%)] p-4 sm:p-6 lg:order-2">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <p className="font-semibold text-primary">{view.potLabel ?? "Free match"}</p>
              <p className="text-muted-foreground">
                Round {view.round} · {view.modeLabel}
              </p>
            </div>

            <p className="my-6 text-center">
              {showTimer ? (
                <span className="text-sm text-primary">
                  {view.status}{" "}
                  <span className="mx-1 font-display text-6xl font-bold text-white">
                    {view.secondsLeft}
                  </span>
                  s
                </span>
              ) : (
                <span className="font-display text-3xl font-bold text-white">{view.status}</span>
              )}
            </p>

            {board}

            {onPlayAgain ? (
              <button
                type="button"
                onClick={onPlayAgain}
                className="mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-bold tracking-wide text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Play again
              </button>
            ) : null}
          </section>

          <div className="order-3">
            <PlayerSeat seat={view.right} />
          </div>
        </div>

        {chat}

        <RoundLog entries={view.log} />
      </div>
    </div>
  );
}
