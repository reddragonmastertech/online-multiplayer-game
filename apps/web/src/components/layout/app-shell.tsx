import { Home, Swords, Target, Trophy, Wallet } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/play", label: "Play", icon: Swords, end: false },
  { to: "/missions", label: "Missions", icon: Target, end: false },
  { to: "/ranking", label: "Ranking", icon: Trophy, end: false },
  { to: "/wallet", label: "Wallet", icon: Wallet, end: false },
] as const;

const titles: Record<string, string> = {
  "/": "Home",
  "/play": "Play",
  "/missions": "Missions",
  "/ranking": "Ranking",
  "/wallet": "Wallet",
};

function itemClass(isActive: boolean, compact = false) {
  return cn(
    "flex items-center gap-3 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    compact ? "flex-col gap-1 px-1 py-1 text-[11px]" : "px-3 py-2.5",
    isActive
      ? "bg-primary/15 text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? "ArenaForge";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-semibold">
            A
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide">ArenaForge</p>
            <p className="text-xs text-muted-foreground">Game platform</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => itemClass(isActive)}
            >
              <item.icon aria-hidden="true" className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-4 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-semibold">
              A
            </span>
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
        </header>
        <main className="shell-canvas min-h-0 flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border bg-card/95 px-2 py-2 backdrop-blur md:hidden"
        aria-label="Primary"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => itemClass(isActive, true)}
          >
            <item.icon aria-hidden="true" className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
