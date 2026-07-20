import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionService,
  type AdminSessionUser,
} from "./AdminSessionService.js";

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: AdminSessionUser;
  }
}

// Exact paths reachable WITHOUT a valid admin session. Everything else behind
// the admin panel requires authentication.
const PUBLIC_PATHS = new Set<string>([
  "/health",
  // Twitch redirects here after OAuth — no cookie/session yet.
  "/api/auth/twitch/callback",
  // Bootstrap: start the admin Twitch login + session lifecycle endpoints.
  "/api/auth/admin/login",
  "/api/auth/admin/me",
  "/api/auth/admin/logout",
  // Public read-only command guide (Довідник команд).
  "/api/public/command-guide",
  // Song-request overlay (OBS browser source has no admin cookie).
  "/api/public/song-queue",
  "/api/public/song-queue/current",
  "/api/public/song-queue/advance",
  "/api/public/song-queue/state",
  // Public song-queue page: recently played history (read-only).
  "/api/public/song-queue/history",
]);

function isPublic(request: FastifyRequest) {
  // CORS preflight carries no credentials.
  if (request.method === "OPTIONS") {
    return true;
  }

  // Strip query string; routerPath is not always set this early.
  const path = request.url.split("?")[0];
  return PUBLIC_PATHS.has(path);
}

/**
 * Registers a global onRequest guard that rejects any request lacking a valid
 * admin session cookie, except for the public bootstrap paths above.
 */
export function registerAdminAuthGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublic(request)) {
      return;
    }

    const token = request.cookies?.[ADMIN_SESSION_COOKIE];
    const session = adminSessionService.verifyToken(token);

    if (!session) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    // Expose the authenticated admin for downstream handlers if needed.
    request.adminUser = session;
  });
}
