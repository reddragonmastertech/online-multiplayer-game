import type { AdminAuditEntry } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminAuditRequest } from "@/lib/admin-api";
import { messageOf, when } from "./admin-ui";

/** Every admin action, newest first. Nothing in the site can edit or delete these rows. */
export function AdminAuditPage() {
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminAuditRequest()
      .then((response) => setEntries(response.entries))
      .catch((cause) => setError(messageOf(cause)));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Audit log</h1>
      <p className="text-sm text-muted-foreground">The latest 200 admin actions. Nobody can edit or delete them from the site.</p>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Audit entries">
        {(entries ?? []).map((entry) => (
          <li key={entry.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-xs text-muted-foreground">{when(entry.createdAt)}</span>
              <span className="font-semibold">{entry.adminName}</span>
              <code className="text-gold">{entry.action}</code>
              {entry.targetUserId ? (
                <Link to={`/admin/players/${entry.targetUserId}`} className="text-primary">
                  {entry.targetName ?? entry.targetUserId}
                </Link>
              ) : null}
              {entry.ip ? <span className="ml-auto text-xs text-muted-foreground">{entry.ip}</span> : null}
            </div>
            {Object.keys(entry.details).length > 0 ? (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{JSON.stringify(entry.details)}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {entries && entries.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : null}
    </div>
  );
}
