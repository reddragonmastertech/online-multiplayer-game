import { z } from "zod";

/**
 * Site-wide switches an admin can flip without a restart (Roadmap 4.2 part
 * D3). Everyone can read them; the server enforces every one of them.
 */

const perNetwork = z.object({ trc20: z.boolean(), bep20: z.boolean(), erc20: z.boolean() });

export const announcementSchema = z.object({
  text: z.string().trim().min(1, "Write the announcement.").max(300),
  level: z.enum(["info", "warning"]),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const siteSettingsSchema = z.object({
  /** No new matches; matches already running finish normally. */
  maintenance: z.boolean(),
  /** USDT rooms open for new matches. RAC rooms are never switched off here. */
  usdtRooms: z.boolean(),
  /** Player deposit claims, per network. Admins can still credit by hand. */
  deposits: perNetwork,
  /** New withdrawal requests, per network. Admins can still pay open ones. */
  withdrawals: perNetwork,
  /** A banner on every page, or none. */
  announcement: announcementSchema.nullable(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  maintenance: false,
  usdtRooms: true,
  deposits: { trc20: true, bep20: true, erc20: true },
  withdrawals: { trc20: true, bep20: true, erc20: true },
  announcement: null,
};
