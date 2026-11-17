import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AuthModal } from "@/components/auth/auth-modal";
import { SiteBanner } from "@/components/layout/site-banner";
import { SiteHeader } from "@/components/layout/site-header";
import { useSessionStore } from "@/stores/session-store";
import { useSiteStore } from "@/stores/site-store";
import { useUiStore } from "@/stores/ui-store";

export function ArenaFrame() {
  const pathname = useLocation().pathname;
  const closeAuth = useUiStore((state) => state.closeAuth);
  const hydrate = useSessionStore((state) => state.hydrate);
  const loadSite = useSiteStore((state) => state.load);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void loadSite();
    const timer = window.setInterval(() => void loadSite(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadSite]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") return;
    closeAuth();
  }, [pathname, closeAuth]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background font-sans text-foreground">
      <SiteHeader />
      <SiteBanner />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
      <AuthModal />
    </div>
  );
}
