import { DEFAULT_SITE_SETTINGS, apiPaths, type SiteSettings } from "@game-platform/shared";
import { create } from "zustand";
import { apiRequest } from "@/lib/api";

/**
 * The site switches (maintenance, paused rooms and networks, the banner).
 * Read every minute so a change reaches open pages without a reload. The
 * server enforces every switch; this only lets the page say so up front.
 */
type SiteState = {
  settings: SiteSettings;
  load: () => Promise<void>;
};

export const useSiteStore = create<SiteState>((set) => ({
  settings: DEFAULT_SITE_SETTINGS,
  load: async () => {
    try {
      set({ settings: await apiRequest<SiteSettings>(apiPaths.site, {}, null) });
    } catch {
      // Keep the last known settings; the server still refuses what is closed.
    }
  },
}));
