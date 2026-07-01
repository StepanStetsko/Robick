import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthRepository } from "./AuthRepository.js";
import { AuthService } from "./AuthService.js";
import { OAuthStateStore } from "./OAuthStateStore.js";
import { TokenManagerService } from "./TokenManagerService.js";
import { TwitchOAuthService } from "./TwitchOAuthService.js";
import { TwitchUsersService } from "./TwitchUsersService.js";
import { env, adminAllowedLogins } from "../../config/env.js";
import { twitchRealtimeHub } from "../twitch/realtime/twitch-realtime-hub.js";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  adminSessionService,
} from "./AdminSessionService.js";

const loginQuerySchema = z.object({
  accountType: z.enum(["broadcaster", "bot"]),
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const refreshBodySchema = z.object({
  accountType: z.enum(["broadcaster", "bot"]),
});

const sharedStateStore = new OAuthStateStore();

export class AuthController {
  private readonly repository = new AuthRepository();
  private readonly oauthService = new TwitchOAuthService();
  private readonly usersService = new TwitchUsersService();
  private readonly tokenManager = new TokenManagerService(
    this.repository,
    this.oauthService,
  );

  private readonly service = new AuthService(
    this.repository,
    this.oauthService,
    this.usersService,
    this.tokenManager,
    sharedStateStore,
  );

  async login(request: FastifyRequest, reply: FastifyReply) {
    const query = loginQuerySchema.parse(request.query);
    const { url } = this.service.getLoginUrl(query.accountType);

    return reply.redirect(url);
  }

  async callback(request: FastifyRequest, reply: FastifyReply) {
    const query = callbackQuerySchema.parse(request.query);

    // Which admin window opened this popup, derived from the state prefix, so
    // error/denied paths post back to the right listener.
    const popupSource = query.state?.startsWith("admin-login:")
      ? "admin-auth"
      : "twitch-auth";

    try {
      if (query.error) {
        const errorHtml = buildAuthPopupHtml({
          source: popupSource,
          ok: false,
          error: query.error_description || query.error,
        });

        return reply.type("text/html").send(errorHtml);
      }

      const result = await this.service.handleCallback({
        code: query.code,
        state: query.state,
      });

      if (result.kind === "admin-login") {
        const login = result.user.login.toLowerCase();
        const allowed = adminAllowedLogins.includes(login);

        if (!allowed) {
          const deniedHtml = buildAuthPopupHtml({
            source: "admin-auth",
            ok: false,
            error: `Логін @${result.user.login} не має доступу до адмінки`,
          });

          return reply.type("text/html").send(deniedHtml);
        }

        const token = adminSessionService.issueToken({
          sub: result.user.id,
          login,
          displayName: result.user.displayName,
        });

        reply.setCookie(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());

        const successHtml = buildAuthPopupHtml({
          source: "admin-auth",
          ok: true,
          login: result.user.login,
          displayName: result.user.displayName,
        });

        return reply.type("text/html").send(successHtml);
      }

      const status = await this.service.getAuthStatus();
      twitchRealtimeHub.publish("auth.status", status);

      const successHtml = buildAuthPopupHtml({
        source: "twitch-auth",
        ok: true,
        accountType: result.accountType,
        login: result.account.login,
        displayName: result.account.displayName,
      });

      return reply.type("text/html").send(successHtml);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authorization failed";

      const errorHtml = buildAuthPopupHtml({
        source: popupSource,
        ok: false,
        error: message,
      });

      return reply.type("text/html").send(errorHtml);
    }
  }

  async adminLogin(_request: FastifyRequest, reply: FastifyReply) {
    const { url } = this.service.getAdminLoginUrl();
    return reply.redirect(url);
  }

  async adminMe(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[ADMIN_SESSION_COOKIE];
    const session = adminSessionService.verifyToken(token);

    if (!session) {
      return reply.status(401).send({ authenticated: false });
    }

    return reply.send({
      authenticated: true,
      user: {
        twitchUserId: session.twitchUserId,
        login: session.login,
        displayName: session.displayName,
        expiresAt: session.expiresAt,
      },
    });
  }

  async adminLogout(_request: FastifyRequest, reply: FastifyReply) {
    reply.clearCookie(ADMIN_SESSION_COOKIE, {
      ...adminSessionCookieOptions(),
      maxAge: undefined,
    });

    return reply.send({ ok: true });
  }

  async status(_request: FastifyRequest, reply: FastifyReply) {
    const status = await this.service.getAuthStatus();
    return reply.send(status);
  }

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const body = refreshBodySchema.parse(request.body);
    const result = await this.service.refreshAccountToken(body.accountType);

    const status = await this.service.getAuthStatus();
    twitchRealtimeHub.publish("auth.status", status);

    return reply.send(result);
  }
}

function buildAuthPopupHtml(payload: Record<string, unknown>) {
  const serializedPayload = JSON.stringify(payload);
  const serializedOrigin = JSON.stringify(env.ADMIN_BASE_URL);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Twitch Auth</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #0f1115;
        color: #f3f4f6;
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
      }
      .box {
        padding: 24px;
        border-radius: 14px;
        background: #181c23;
        border: 1px solid #2b3240;
        max-width: 420px;
        text-align: center;
      }
      .muted {
        color: #9ca3af;
        margin-top: 8px;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Twitch authorization completed</h2>
      <p class="muted">This window will close automatically.</p>
    </div>

    <script>
      (function () {
        const payload = ${serializedPayload};
        const targetOrigin = ${serializedOrigin};

        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, targetOrigin);
        }

        setTimeout(() => window.close(), 150);
      })();
    </script>
  </body>
</html>`;
}