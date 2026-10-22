import { useEffect } from "react";
import { IntroPage } from "@/pages/intro-page";
import { useUiStore, type AuthTab } from "@/stores/ui-store";

export function AuthEntryPage({ tab }: { tab: AuthTab }) {
  const openAuth = useUiStore((state) => state.openAuth);

  useEffect(() => {
    openAuth(tab);
  }, [openAuth, tab]);

  return <IntroPage />;
}
