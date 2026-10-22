import { Link } from "react-router-dom";

const links = [
  { to: "/how-it-works", label: "Rules" },
  { to: "/support", label: "Support" },
  { to: "/legal/terms", label: "Terms" },
  { to: "/legal/privacy", label: "Privacy" },
  { to: "/legal/eligibility", label: "Eligibility" },
  { to: "/legal/responsible-play", label: "Responsible play" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-[#070b16] px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Arena · skill-based PvP</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
