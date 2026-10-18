import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AuthModal } from "@/components/auth/auth-modal";
import { HomeHeader } from "@/components/home/home-header";
import { useUiStore } from "@/stores/ui-store";

export function ArenaFrame() {
  const pathname = useLocation().pathname;
  const closeAuth = useUiStore((state) => state.closeAuth);

  useEffect(() => {
    closeAuth();
  }, [pathname, closeAuth]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#070b14] font-[Inter,Segoe_UI,sans-serif] text-white">
      <HomeHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
      <AuthModal />
    </div>
  );
}
