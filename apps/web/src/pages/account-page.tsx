import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { racAvailable, useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

export function AccountPage() {
  const user = useSessionStore((state) => state.user);
  const wallets = useSessionStore((state) => state.wallets);
  const status = useSessionStore((state) => state.status);
  const logout = useSessionStore((state) => state.logout);
  const openAuth = useUiStore((state) => state.openAuth);

  if (status === "boot") {
    return (
      <div className="grid h-full place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <h1 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">Account</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Log in to see your name and RAC balance.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => openAuth("login")}>Log in</Button>
            <Button variant="secondary" onClick={() => openAuth("signup")}>
              Sign up
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const rac = wallets.find((wallet) => wallet.currency === "rac");

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">
          <Link to="/lobby" className="hover:text-foreground">
            Lobby
          </Link>
          <span aria-hidden="true"> / </span>
          Account
        </p>
        <h1 className="mt-4 font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">{user.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>

        <section className="mt-6 rounded-3xl border border-primary/40 bg-card p-6">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">RAC BALANCE</p>
          <p className="mt-2 font-[Rajdhani,Inter,sans-serif] text-5xl font-bold text-primary">
            {racAvailable(wallets)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Available {rac?.available ?? 0} · Locked {rac?.locked ?? 0}
          </p>
        </section>

        <section className="mt-4 rounded-3xl border border-dashed border-border bg-card p-6">
          <h2 className="text-sm font-semibold tracking-[0.16em] text-muted-foreground">MATCH HISTORY</h2>
          <p className="mt-3 text-sm text-muted-foreground">No matches yet. Live PvP history will appear here.</p>
        </section>

        <Button className="mt-6" variant="secondary" onClick={logout}>
          Log out
        </Button>
      </main>
    </div>
  );
}
