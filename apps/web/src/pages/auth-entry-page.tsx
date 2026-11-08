import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IntroPage } from "@/pages/intro-page";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore, type AuthTab } from "@/stores/ui-store";

export function AuthEntryPage({ tab }: { tab: AuthTab }) {
  const openAuth = useUiStore((state) => state.openAuth);
  const user = useSessionStore((state) => state.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      void navigate("/lobby", { replace: true });
      return;
    }
    openAuth(tab);
  }, [openAuth, tab, user, navigate]);

  return <IntroPage />;
}
