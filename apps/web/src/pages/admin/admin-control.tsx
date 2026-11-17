import { NETWORK_INFO, can, depositNetworks, type DepositNetwork, type SiteSettings } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminSaveSite, adminSiteRequest, useAdminSession } from "@/lib/admin-api";
import { useSiteStore } from "@/stores/site-store";
import { cn } from "@/lib/utils";
import { AdminSection, inputClass, messageOf } from "./admin-ui";

/** An on/off switch with a visible state, so nobody has to guess what "on" means. */
function Toggle({
  label,
  detail,
  on,
  onLabel,
  offLabel,
  danger,
  disabled,
  onChange,
}: {
  label: string;
  detail?: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  /** "on" is the unusual, attention-worthy state (e.g. maintenance). */
  danger?: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const alarming = danger ? on : !on;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn(
          "min-w-28 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          alarming ? "border-danger/50 bg-danger/15 text-danger" : "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {on ? onLabel : offLabel}
      </button>
    </div>
  );
}

export function AdminControlPage() {
  const role = useAdminSession((state) => state.session?.role);
  const refreshPublic = useSiteStore((state) => state.load);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [draft, setDraft] = useState<{ text: string; level: "info" | "warning" }>({ text: "", level: "info" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const editable = can(role, "site.control");

  useEffect(() => {
    adminSiteRequest()
      .then((value) => {
        setSettings(value);
        if (value.announcement) setDraft(value.announcement);
      })
      .catch((cause) => setError(messageOf(cause)));
  }, []);

  /** Every switch saves at once: in an emergency nobody should have to find a Save button. */
  async function save(next: SiteSettings, what: string) {
    setError(null);
    setSaved(null);
    try {
      setSettings(await adminSaveSite(next));
      setSaved(`${what} saved.`);
      await refreshPublic();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  if (!settings) return error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;

  const network = (kind: "deposits" | "withdrawals", id: DepositNetwork, on: boolean) =>
    save({ ...settings, [kind]: { ...settings[kind], [id]: on } }, `${NETWORK_INFO[id].label} ${kind}`);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="font-display text-3xl font-bold">Control</h1>
      <p className="text-sm text-muted-foreground">
        Every switch takes effect at once, for everyone, without a restart. Each change is in the audit log.
        {editable ? "" : " Your role can see these but not change them."}
      </p>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
      {saved ? <p role="status" className="text-sm font-semibold text-primary">{saved}</p> : null}

      <AdminSection title="Matches">
        <Toggle
          label="Maintenance mode"
          detail="No new matches. Matches already running finish normally."
          on={settings.maintenance}
          onLabel="MAINTENANCE"
          offLabel="OPEN"
          danger
          disabled={!editable}
          onChange={(on) => void save({ ...settings, maintenance: on }, "Maintenance mode")}
        />
        <Toggle
          label="USDT rooms"
          detail="RAC rooms stay open either way."
          on={settings.usdtRooms}
          onLabel="OPEN"
          offLabel="PAUSED"
          disabled={!editable}
          onChange={(on) => void save({ ...settings, usdtRooms: on }, "USDT rooms")}
        />
      </AdminSection>

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminSection title="Deposits">
          {depositNetworks.map((id) => (
            <Toggle
              key={id}
              label={`${NETWORK_INFO[id].label} deposits`}
              on={settings.deposits[id]}
              onLabel="OPEN"
              offLabel="PAUSED"
              disabled={!editable}
              onChange={(on) => void network("deposits", id, on)}
            />
          ))}
          <p className="mt-1 text-xs text-muted-foreground">Paused: players cannot claim. You can still credit by hand.</p>
        </AdminSection>
        <AdminSection title="Withdrawals">
          {depositNetworks.map((id) => (
            <Toggle
              key={id}
              label={`${NETWORK_INFO[id].label} withdrawals`}
              on={settings.withdrawals[id]}
              onLabel="OPEN"
              offLabel="PAUSED"
              disabled={!editable}
              onChange={(on) => void network("withdrawals", id, on)}
            />
          ))}
          <p className="mt-1 text-xs text-muted-foreground">Paused: no new requests. Open ones can still be paid.</p>
        </AdminSection>
      </div>

      <AdminSection title="Announcement banner">
        <p className="text-sm text-muted-foreground">
          {settings.announcement ? `Showing now: "${settings.announcement.text}"` : "No banner is showing."}
        </p>
        {editable ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save({ ...settings, announcement: { text: draft.text.trim(), level: draft.level } }, "Announcement");
            }}
          >
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs text-muted-foreground">Text (every page shows it)</span>
              <input
                value={draft.text}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                maxLength={300}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Style</span>
              <select
                value={draft.level}
                onChange={(event) => setDraft({ ...draft, level: event.target.value as "info" | "warning" })}
                className="h-9 rounded-xl border border-border bg-black/40 px-2 text-sm"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
              </select>
            </label>
            <Button type="submit" size="sm" className="h-9" disabled={!draft.text.trim()}>
              Show banner
            </Button>
            {settings.announcement ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9"
                onClick={() => void save({ ...settings, announcement: null }, "Banner removal")}
              >
                Remove banner
              </Button>
            ) : null}
          </form>
        ) : null}
      </AdminSection>
    </div>
  );
}
