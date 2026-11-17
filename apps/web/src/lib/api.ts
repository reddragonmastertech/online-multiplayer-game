import {
  apiPaths,
  type AuthSuccess,
  type DepositClaim,
  type DepositClaimResponse,
  type DepositOverview,
  type SaveDepositWallet,
  type LiveMatchesResponse,
  type LoginRequest,
  type MatchHistoryResponse,
  type MeResponse,
  type SignupRequest,
  type WithdrawalList,
  type WithdrawalRecord,
  type WithdrawalRequest,
} from "@game-platform/shared";

export const TOKEN_STORAGE_KEY = "arena.accessToken";

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/** Sends a request with a bearer token: the player's login token unless another is given. */
export async function apiRequest<T>(path: string, init: RequestInit = {}, token: string | null = getStoredToken()): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new ApiRequestError(
      error?.code ?? "invalid_input",
      error?.message ?? "Request failed.",
      response.status,
    );
  }

  return payload as T;
}

function request<T>(path: string, init: RequestInit = {}) {
  return apiRequest<T>(path, init);
}

export function signupRequest(body: SignupRequest) {
  return request<AuthSuccess>(apiPaths.signup, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function loginRequest(body: LoginRequest) {
  return request<AuthSuccess>(apiPaths.login, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function meRequest() {
  return request<MeResponse>(apiPaths.me);
}

export function matchHistoryRequest() {
  return request<MatchHistoryResponse>(apiPaths.matches);
}

export function liveMatchesRequest() {
  return request<LiveMatchesResponse>(apiPaths.live);
}

export function depositOverviewRequest() {
  return request<DepositOverview>(apiPaths.deposits);
}

export function saveDepositWalletRequest(body: SaveDepositWallet) {
  return request<SaveDepositWallet>(apiPaths.depositWallets, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function claimDepositRequest(body: DepositClaim) {
  return request<DepositClaimResponse>(apiPaths.depositClaim, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function withdrawalsRequest() {
  return request<WithdrawalList>(apiPaths.withdrawals);
}

export function requestWithdrawal(body: WithdrawalRequest) {
  return request<{ withdrawal: WithdrawalRecord }>(apiPaths.withdrawals, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

