import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/lobby", label: "Games" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/watch", label: "Watch" },
];

export function BrandLink() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-primary font-[Rajdhani,Inter,sans-serif] text-lg font-bold text-primary-foreground">
        A
      </span>
      <span className="font-[Rajdhani,Inter,sans-serif] text-xl font-bold tracking-[0.18em] text-foreground">
        ARENA
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const openAuth = useUiStore((state) => state.openAuth);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="z-20 shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <BrandLink />

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground",
                  isActive && "text-primary",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button variant="secondary" onClick={() => openAuth("login")}>
            Log in
          </Button>
          <Button onClick={() => openAuth("signup")}>Get Started</Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {menuOpen ? (
        <div className="border-t border-border px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-elevated hover:text-foreground"
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" variant="secondary" onClick={() => openAuth("login")}>
              Log in
            </Button>
            <Button className="flex-1" onClick={() => openAuth("signup")}>
              Get Started
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
