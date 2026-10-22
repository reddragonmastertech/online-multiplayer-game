import { X } from "lucide-react";
import { useEffect, type InputHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { useUiStore, type AuthTab } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = props.id ?? label;

  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <input
        id={id}
        className="w-full rounded-xl border border-border bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring"
        {...props}
      />
    </label>
  );
}

const tabs: { id: AuthTab; label: string }[] = [
  { id: "login", label: "Log in" },
  { id: "signup", label: "Sign up" },
];

export function AuthModal() {
  const open = useUiStore((state) => state.authOpen);
  const tab = useUiStore((state) => state.authTab);
  const closeAuth = useUiStore((state) => state.closeAuth);
  const setAuthTab = useUiStore((state) => state.setAuthTab);
  const login = tab === "login";

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeAuth();
    }

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, closeAuth]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={closeAuth}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-primary/40 bg-card p-5 shadow-[0_0_48px_rgb(66_221_205/0.12)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={closeAuth}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full border border-border text-muted-foreground"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <p className="text-center font-[Rajdhani,Inter,sans-serif] text-sm font-bold tracking-[0.22em] text-primary">
          ARENA
        </p>
        <h2
          id="auth-title"
          className="mt-2 text-center font-[Rajdhani,Inter,sans-serif] text-3xl font-bold tracking-wide"
        >
          {login ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {login ? "Log in to join your next match." : "Pick a display name to enter the lobby."}
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-full bg-black/40 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setAuthTab(item.id)}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-semibold",
                tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form key={tab} className="mt-5 space-y-3" onSubmit={(event) => event.preventDefault()}>
          {login ? null : (
            <Field id="auth-name" label="DISPLAY NAME" name="name" placeholder="NovaAce" autoComplete="username" />
          )}
          <Field
            id="auth-email"
            label="EMAIL"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
          />
          <Field
            id="auth-password"
            label="PASSWORD"
            name="password"
            type="password"
            placeholder="Enter your password"
            autoComplete={login ? "current-password" : "new-password"}
          />
          {login ? (
            <p className="text-xs text-muted-foreground">Password reset will ship with the auth backend.</p>
          ) : null}
          <Button type="submit" className="mt-2 w-full" size="lg">
            {login ? "Log in" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
