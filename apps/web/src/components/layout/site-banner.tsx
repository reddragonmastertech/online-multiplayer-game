import { Info, Wrench } from "lucide-react";
import { useSiteStore } from "@/stores/site-store";
import { cn } from "@/lib/utils";

/** The admin's announcement, and a maintenance notice, above every page. */
export function SiteBanner() {
  const { maintenance, announcement } = useSiteStore((state) => state.settings);
  if (!maintenance && !announcement) return null;

  return (
    <div className="shrink-0" role="region" aria-label="Site notices">
      {maintenance ? (
        <p className="flex items-center justify-center gap-2 bg-gold/15 px-4 py-2 text-center text-sm font-semibold text-gold">
          <Wrench className="size-4 shrink-0" aria-hidden="true" />
          Maintenance: new matches are paused. Matches already running will finish.
        </p>
      ) : null}
      {announcement ? (
        <p
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold",
            announcement.level === "warning" ? "bg-danger/15 text-danger" : "bg-primary/10 text-primary",
          )}
        >
          <Info className="size-4 shrink-0" aria-hidden="true" />
          {announcement.text}
        </p>
      ) : null}
    </div>
  );
}
