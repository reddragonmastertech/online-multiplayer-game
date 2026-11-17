import { ROLE_INFO, can, type AdminGate } from "@game-platform/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { adminEnableTotp, adminGateRequest, adminSetupTotp, adminStartSession, useAdminSession } from "@/lib/admin-api";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { CopyButton, inputClass, messageOf } from "./admin-ui";

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 sm:p-8">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

/** The two-factor step: set it up the first time, then a fresh code per session. */
function TwoFactor({ gate }: { gate: AdminGate }) {
  const setSession = useAdminSession((state) => state.set);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await adminSetupTotp());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(gate.totpEnabled ? await adminStartSession(code.trim()) : await adminEnableTotp(code.trim()));
    } catch (cause) {
      setError(messageOf(cause));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const codeForm = (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <label htmlFor="admin-code" className="block text-sm text-muted-foreground">
        6-digit code from your authenticator app
      </label>
      <div className="flex gap-2">
        <input
          id="admin-code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className={cn(inputClass, "h-10 text-center font-mono text-lg tracking-[0.4em]")}
        />
        <Button type="submit" className="h-10" disabled={busy || code.length !== 6}>
          {gate.totpEnabled ? "Continue" : "Turn on"}
        </Button>
      </div>
    </form>
  );

  return (
    <Centered title="Admin sign-in">
      <p className="text-sm text-muted-foreground">
        You are {ROLE_INFO[gate.role].label}. Admin pages need a two-factor code as well as your password.
      </p>
      {gate.totpEnabled ? (
        codeForm
      ) : setup ? (
        <>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Open Google Authenticator, Authy or a similar app on your phone.</li>
            <li>
              Add an account with this setup key (or{" "}
              <a href={setup.uri} className="text-primary underline">
                open it on this phone
              </a>
              ):
            </li>
          </ol>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-sm font-semibold" data-testid="totp-secret">
              {setup.secret.match(/.{1,4}/g)?.join(" ")}
            </code>
            <CopyButton text={setup.secret} label="Copy setup key" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Keep this key private. Anyone with it can make your codes.</p>
          {codeForm}
        </>
      ) : (
        <Button className="mt-4" onClick={startSetup} disabled={busy}>
          Set up two-factor
        </Button>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </Centered>
  );
}

const tabs = [
  { to: "/admin", label: "Dashboard", end: true, permission: "view" },
  { to: "/admin/players", label: "Players", permission: "view" },
  { to: "/admin/withdrawals", label: "Withdrawals", permission: "view" },
  { to: "/admin/money", label: "Money", permission: "view" },
  { to: "/admin/audit", label: "Audit log", permission: "view" },
  { to: "/admin/admins", label: "Admins", permission: "view" },
] as const;

export function AdminLayout() {
  const user = useSessionStore((state) => state.user);
  const status = useSessionStore((state) => state.status);
  const openAuth = useUiStore((state) => state.openAuth);
  const session = useAdminSession((state) => state.session);
  const clearSession = useAdminSession((state) => state.clear);
  const [gate, setGate] = useState<AdminGate | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      clearSession();
      setGate(null);
      return;
    }
    if (!user.role || session) return;
    adminGateRequest()
      .then(setGate)
      .catch((cause) => setGateError(messageOf(cause)));
  }, [user, session, clearSession]);

  if (status === "boot") return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  if (!user) {
    return (
      <Centered title="Admin">
        <p className="text-sm text-muted-foreground">Log in with your admin account first.</p>
        <Button className="mt-4" onClick={() => openAuth("login")}>
          Log in
        </Button>
      </Centered>
    );
  }

  if (!user.role) {
    return (
      <Centered title="Admin">
        <p className="text-sm text-muted-foreground">This page is for admins only.</p>
        <Button className="mt-4" asChild>
          <Link to="/lobby">Back to games</Link>
        </Button>
      </Centered>
    );
  }

  if (!session) {
    if (gateError) return <Centered title="Admin">{gateError}</Centered>;
    return gate ? <TwoFactor gate={gate} /> : <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="min-h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-sm font-bold tracking-[0.2em] text-gold">ADMIN</p>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            {tabs
              .filter((tab) => can(session.role, tab.permission))
              .map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={"end" in tab ? tab.end : false}
                  className={({ isActive }) =>
                    cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground",
                      isActive && "bg-elevated text-foreground",
                    )
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
          </nav>
          <span className="ml-auto text-xs text-muted-foreground">
            {user.name} · {ROLE_INFO[session.role].label} · until {new Date(session.expiresAt).toLocaleTimeString()}
          </span>
          <Button variant="ghost" size="sm" onClick={clearSession}>
            Lock
          </Button>
        </div>
        <div className="mt-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
