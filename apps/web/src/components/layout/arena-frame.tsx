import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AuthModal } from "@/components/auth/auth-modal";
import { SiteHeader } from "@/components/layout/site-header";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

export function ArenaFrame() {
  const pathname = useLocation().pathname;
  const closeAuth = useUiStore((state) => state.closeAuth);
  const hydrate = useSessionStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/signup") return;
    closeAuth();
  }, [pathname, closeAuth]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background font-sans text-foreground">
      <SiteHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
      <AuthModal />
    </div>
  );
}
