import {
  apiPaths,
  type AdminAuditEntry,
  type AdminDashboard,
  type AdminGate,
  type AdminPlayerAction,
  type AdminPlayerDetail,
  type AdminPlayerSummary,
  type AdminRole,
  type AdminRoleUpdate,
  type AdminSession,
  type AdminTempPassword,
  type AdminTotpSetup,
  type AdminWithdrawalList,
  type WithdrawalDecision,
  type WithdrawalRecord,
} from "@game-platform/shared";
import { create } from "zustand";
import { ApiRequestError, apiRequest } from "@/lib/api";

/**
 * The admin session: a short-lived token issued after a two-factor code. It
 * lives in sessionStorage, so closing the tab ends it, and it is never sent
 * on player requests.
 */

const STORAGE_KEY = "arena.adminSession";

function readStored(): AdminSession | null {
  try {
    const session = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as AdminSession | null;
    return session && new Date(session.expiresAt).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}

type AdminSessionState = {
  session: AdminSession | null;
  set: (session: AdminSession) => void;
  clear: () => void;
};

export const useAdminSession = create<AdminSessionState>((set) => ({
  session: readStored(),
  set: (session) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage can be blocked; the session still works until reload.
    }
    set({ session });
  },
  clear: () => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored.
    }
    set({ session: null });
  },
}));

/** An admin API call. An expired or ended session sends the admin back to the code screen. */
async function adminRequest<T>(path: string, init: RequestInit = {}) {
  try {
    return await apiRequest<T>(path, init, useAdminSession.getState().session?.token ?? null);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.code === "two_factor_required")) {
      useAdminSession.getState().clear();
    }
    throw error;
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/* Before a session: these use the normal login token. */
export const adminGateRequest = () => apiRequest<AdminGate>(apiPaths.adminGate);
export const adminSetupTotp = () => apiRequest<AdminTotpSetup>(apiPaths.admin2faSetup, { method: "POST" });
export const adminEnableTotp = (code: string) => apiRequest<AdminSession>(apiPaths.admin2faEnable, post({ code }));
export const adminStartSession = (code: string) => apiRequest<AdminSession>(apiPaths.adminSession, post({ code }));

/* With a session. */
export const adminDashboardRequest = () => adminRequest<AdminDashboard>(apiPaths.adminDashboard);
export const adminSearchPlayers = (q: string) =>
  adminRequest<{ players: AdminPlayerSummary[] }>(`${apiPaths.adminPlayers}?q=${encodeURIComponent(q)}`);
export const adminPlayerRequest = (id: string) =>
  adminRequest<AdminPlayerDetail>(apiPaths.adminPlayer.replace(":id", encodeURIComponent(id)));
export function adminPlayerAction<T = AdminPlayerDetail>(id: string, action: AdminPlayerAction, body: unknown) {
  return adminRequest<T>(
    apiPaths.adminPlayerAction.replace(":id", encodeURIComponent(id)).replace(":action", action),
    post(body),
  );
}
export const adminTempPassword = (id: string, reason: string) =>
  adminPlayerAction<AdminTempPassword>(id, "temp-password", { reason });
export const adminAuditRequest = () => adminRequest<{ entries: AdminAuditEntry[] }>(apiPaths.adminAudit);
export const adminAdminsRequest = () =>
  adminRequest<{
    admins: { id: string; name: string; role: AdminRole; totpEnabled: boolean; lastSeenAt: string | null }[];
  }>(apiPaths.adminAdmins);
export const adminSetRole = (body: AdminRoleUpdate) => adminRequest<{ ok: true }>(apiPaths.adminAdmins, post(body));
export const adminWithdrawalsRequest = () => adminRequest<AdminWithdrawalList>(apiPaths.adminWithdrawals);
export const adminDecideWithdrawal = (id: string, body: WithdrawalDecision) =>
  adminRequest<{ withdrawal: WithdrawalRecord }>(
    apiPaths.adminWithdrawalDecision.replace(":id", encodeURIComponent(id)),
    post(body),
  );
