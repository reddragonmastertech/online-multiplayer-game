import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function MatchClosed({
  title,
  detail,
  backTo = "/",
}: {
  title: string;
  detail: string;
  backTo?: string;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <section className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="font-display text-3xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        <Link
          to={backTo}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-4 py-2 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Lobby
        </Link>
      </section>
    </div>
  );
}
