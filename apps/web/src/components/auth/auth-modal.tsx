import { X } from "lucide-react";
import { useEffect, type InputHTMLAttributes } from "react";
import { useUiStore, type AuthTab } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = props.id ?? label;

  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.14em] text-white/55">
        {label}
      </span>
      <input
        id={id}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none ring-[#f3c969] placeholder:text-white/30 focus:ring-2"
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
      className="fixed inset-0 z-50 grid place-items-center bg-[#070b14]/80 p-4 backdrop-blur-sm"
      onClick={closeAuth}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-[#e3b34a]/70 bg-[#0c1018] p-5 shadow-[0_0_48px_rgb(227_179_74/0.16)] sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={closeAuth}
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full border border-white/15 text-white/70"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <p className="text-center text-[11px] font-semibold tracking-[0.22em] text-[#e7c56a]">
          RPS ARENA
        </p>
        <h2
          id="auth-title"
          className="mt-2 text-center font-[Rajdhani,Inter,sans-serif] text-3xl font-bold tracking-wide"
        >
          {login ? "Welcome back" : "Join the arena"}
        </h2>
        <p className="mt-1 text-center text-sm text-white/50">
          {login ? "Pick up your matches and balance." : "Claim a name and start playing."}
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
                tab === item.id
                  ? "bg-gradient-to-r from-[#ffe7a3] to-[#e09a2b] text-[#1a1408]"
                  : "text-white/55",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form key={tab} className="mt-5 space-y-3" onSubmit={(event) => event.preventDefault()}>
          {login ? null : (
            <Field id="auth-name" label="ARENA NAME" name="name" placeholder="NovaAce" autoComplete="username" />
          )}
          <Field
            id="auth-email"
            label="EMAIL"
            name="email"
            type="email"
            placeholder="you@arena.com"
            autoComplete="email"
            autoFocus
          />
          <Field
            id="auth-password"
            label="PASSWORD"
            name="password"
            type="password"
            placeholder="Your password"
            autoComplete={login ? "current-password" : "new-password"}
          />
          <button
            type="submit"
            className="mt-2 w-full rounded-full bg-gradient-to-r from-[#ff6b8a] to-[#ff2d55] py-2.5 text-sm font-bold tracking-wide text-white shadow-[0_8px_24px_rgb(255_45_85/0.28)]"
          >
            {login ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-white/40">✊ Rock · ✋ Paper · ✌️ Scissors</p>
      </div>
    </div>
  );
}
