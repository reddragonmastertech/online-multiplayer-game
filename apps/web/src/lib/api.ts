import {
  apiPaths,
  type AuthSuccess,
  type LoginRequest,
  type MeResponse,
  type SignupRequest,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getStoredToken();

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
