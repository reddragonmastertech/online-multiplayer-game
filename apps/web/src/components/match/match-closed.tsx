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
      <section className="max-w-md rounded-2xl border border-[#30425B] bg-[#121D2D] p-6 text-center">
        <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-[#B1C0D2]">{detail}</p>
        <Link
          to={backTo}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#30425B] bg-[#1B2940] px-4 py-2 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Lobby
        </Link>
      </section>
    </div>
  );
}
