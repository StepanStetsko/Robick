import { http } from "./http";
import type {
  AuthAccountType,
  AuthStatus,
  RefreshAuthResponse,
} from "../types/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

export function buildTwitchLoginUrl(accountType: AuthAccountType) {
  const url = new URL("/api/auth/twitch/login", API_BASE_URL);
  url.searchParams.set("accountType", accountType);
  return url.toString();
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return http<AuthStatus>("/api/auth/status", {
    method: "GET",
  });
}

export async function refreshAuthToken(
  accountType: AuthAccountType,
): Promise<RefreshAuthResponse> {
  return http<RefreshAuthResponse>("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ accountType }),
  });
}