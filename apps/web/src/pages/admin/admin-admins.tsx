import { ROLE_INFO, adminRoles, can, type AdminRole } from "@game-platform/shared";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminAdminsRequest, adminSetRole, useAdminSession } from "@/lib/admin-api";
import { ActionForm, AdminSection, Field, messageOf, when } from "./admin-ui";

type AdminRow = Awaited<ReturnType<typeof adminAdminsRequest>>["admins"][number];

export function AdminAdminsPage() {
  const role = useAdminSession((state) => state.session?.role);
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAdmins((await adminAdminsRequest()).admins);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Admins</h1>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}

      <AdminSection title="Roles">
        <ul className="space-y-1 text-sm">
          {adminRoles.map((id) => (
            <li key={id}>
              <span className="font-semibold">{ROLE_INFO[id].label}:</span>{" "}
              <span className="text-muted-foreground">{ROLE_INFO[id].detail}</span>
            </li>
          ))}
        </ul>
      </AdminSection>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Admin list">
        {(admins ?? []).map((admin) => (
          <li key={admin.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3 text-sm">
            <Link to={`/admin/players/${admin.id}`} className="font-semibold text-primary">
              {admin.name}
            </Link>
            <span>{ROLE_INFO[admin.role].label}</span>
            <span className={admin.totpEnabled ? "text-muted-foreground" : "text-gold"}>
              {admin.totpEnabled ? "two-factor on" : "two-factor not set up"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">last seen {when(admin.lastSeenAt)}</span>
          </li>
        ))}
      </ul>

      {can(role, "admins.manage") ? (
        <ActionForm
          title="Give, change or remove a role"
          submitLabel="Save"
          needsReason={false}
          onSubmit={async (_reason, form) => {
            const value = String(form.get("role"));
            await adminSetRole({ name: String(form.get("name") ?? "").trim(), role: value === "none" ? null : (value as AdminRole) });
            await load();
          }}
        >
          <Field label="Display name" name="name" maxLength={24} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Role</span>
            <select name="role" className="h-9 rounded-xl border border-border bg-black/40 px-2 text-sm">
              {adminRoles.map((id) => (
                <option key={id} value={id}>
                  {ROLE_INFO[id].label}
                </option>
              ))}
              <option value="none">Not an admin</option>
            </select>
          </label>
        </ActionForm>
      ) : (
        <p className="text-xs text-muted-foreground">Only an owner can change roles.</p>
      )}
    </div>
  );
}
