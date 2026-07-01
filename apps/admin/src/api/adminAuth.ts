import { http } from "./http";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

export type AdminUser = {
  twitchUserId: string;
  login: string;
  displayName: string;
  expiresAt: string;
};

type AdminMeResponse = {
  authenticated: boolean;
  user?: AdminUser;
};

export function buildAdminLoginUrl() {
  return new URL("/api/auth/admin/login", API_BASE_URL).toString();
}

/**
 * Returns the logged-in admin, or null if not authenticated. Does not trigger
 * the global unauthorized handler — callers decide what to do with null.
 */
export async function getAdminMe(): Promise<AdminUser | null> {
  const response = await fetch(
    new URL("/api/auth/admin/me", API_BASE_URL).toString(),
    { credentials: "include" },
  );

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as AdminMeResponse;
  return data.authenticated && data.user ? data.user : null;
}

export async function adminLogout(): Promise<void> {
  await http<{ ok: boolean }>("/api/auth/admin/logout", { method: "POST" });
}
