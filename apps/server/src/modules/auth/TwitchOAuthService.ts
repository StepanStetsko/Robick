import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import type {
  AuthAccountType,
  TwitchTokenResponse,
  TwitchValidateTokenResponse,
} from "./auth.types.js";

type BuildAuthUrlInput = {
  accountType: AuthAccountType;
};

export class TwitchOAuthService {
  buildAuthorizationUrl({ accountType }: BuildAuthUrlInput) {
    const state = this.createState(accountType);
    const scopes =
      accountType === "broadcaster"
        ? env.TWITCH_BROADCASTER_SCOPES
        : env.TWITCH_BOT_SCOPES;

    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    if (!env.TWITCH_REDIRECT_URI) {
      throw new Error("TWITCH_REDIRECT_URI is not set");
    }

    if (!scopes) {
      throw new Error("TWITCH scopes are not set");
    }

    const clientId = env.TWITCH_CLIENT_ID;
    const redirectUri = env.TWITCH_REDIRECT_URI;
    const scopeValue = scopes;

    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopeValue);
    url.searchParams.set("force_verify", "true");
    url.searchParams.set("state", state);

    return {
      url: url.toString(),
      state,
    };
  }

  /**
   * Authorization URL for logging a person INTO the admin panel (not for
   * connecting a bot/broadcaster account). Requests no scopes — the resulting
   * user token is only used once to read the identity via /helix/users, then
   * discarded. The state carries the "admin-login" purpose.
   */
  buildAdminLoginUrl() {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    if (!env.TWITCH_REDIRECT_URI) {
      throw new Error("TWITCH_REDIRECT_URI is not set");
    }

    const state = `admin-login:${randomBytes(16).toString("hex")}`;

    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.TWITCH_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "");
    url.searchParams.set("force_verify", "true");
    url.searchParams.set("state", state);

    return {
      url: url.toString(),
      state,
    };
  }

  async exchangeCodeForToken(code: string) {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    if (!env.TWITCH_CLIENT_SECRET) {
      throw new Error("TWITCH_CLIENT_SECRET is not set");
    }

    if (!env.TWITCH_REDIRECT_URI) {
      throw new Error("TWITCH_REDIRECT_URI is not set");
    }

    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;
    const redirectUri = env.TWITCH_REDIRECT_URI;

    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("code", code);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", redirectUri);

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to exchange Twitch code: ${response.status} ${text}`);
    }

    return (await response.json()) as TwitchTokenResponse;
  }

  async refreshAccessToken(refreshToken: string) {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    if (!env.TWITCH_CLIENT_SECRET) {
      throw new Error("TWITCH_CLIENT_SECRET is not set");
    }

    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;

    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to refresh Twitch token: ${response.status} ${text}`);
    }

    return (await response.json()) as TwitchTokenResponse;
  }

  async validateAccessToken(accessToken: string) {
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to validate Twitch token: ${response.status} ${text}`);
    }

    return (await response.json()) as TwitchValidateTokenResponse;
  }

  private createState(accountType: AuthAccountType) {
    const nonce = randomBytes(16).toString("hex");
    return `${accountType}:${nonce}`;
  }
}