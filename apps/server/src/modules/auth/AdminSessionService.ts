import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

export type AdminSessionPayload = {
  // Twitch user id of the logged-in admin
  sub: string;
  // Twitch login (lowercase)
  login: string;
  displayName: string;
  // issued-at / expires-at, unix seconds
  iat: number;
  exp: number;
};

export type AdminSessionUser = {
  twitchUserId: string;
  login: string;
  displayName: string;
  expiresAt: string;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

/**
 * Stateless signed-token sessions for admin-panel access. The token is
 * `base64url(payload).hmacSHA256(payload)` signed with ADMIN_SESSION_SECRET —
 * no DB row is needed, and a server restart does not log anyone out (the secret
 * is stable across restarts).
 */
export class AdminSessionService {
  private readonly secret = env.ADMIN_SESSION_SECRET;
  private readonly ttlSeconds = env.ADMIN_SESSION_TTL_HOURS * 60 * 60;

  issueToken(input: { sub: string; login: string; displayName: string }) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AdminSessionPayload = {
      sub: input.sub,
      login: input.login,
      displayName: input.displayName,
      iat: now,
      exp: now + this.ttlSeconds,
    };

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  verifyToken(token: string | undefined | null): AdminSessionUser | null {
    if (!token) {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, signature] = parts;
    const expected = this.sign(encodedPayload);

    if (!this.signaturesEqual(signature, expected)) {
      return null;
    }

    let payload: AdminSessionPayload;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;
    } catch {
      return null;
    }

    if (
      typeof payload.sub !== "string" ||
      typeof payload.login !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }

    return {
      twitchUserId: payload.sub,
      login: payload.login,
      displayName: payload.displayName,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  get ttlSecondsValue() {
    return this.ttlSeconds;
  }

  private sign(encodedPayload: string) {
    return createHmac("sha256", this.secret)
      .update(encodedPayload)
      .digest("base64url");
  }

  private signaturesEqual(a: string, b: string) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }
}

export const adminSessionService = new AdminSessionService();

// Shared cookie name + options so login/logout/guard stay in sync.
export const ADMIN_SESSION_COOKIE = "robik_admin_session";

export function adminSessionCookieOptions() {
  const isProd = env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    path: "/",
    maxAge: adminSessionService.ttlSecondsValue,
  };
}
