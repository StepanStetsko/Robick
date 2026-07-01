import { AccountType } from "../../generated/prisma/client.js";
import { AuthRepository } from "./AuthRepository.js";
import { TwitchOAuthService } from "./TwitchOAuthService.js";
import { TwitchUsersService } from "./TwitchUsersService.js";
import { TokenManagerService } from "./TokenManagerService.js";
import { OAuthStateStore } from "./OAuthStateStore.js";
import type { AuthAccountType } from "./auth.types.js";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly oauthService: TwitchOAuthService,
    private readonly usersService: TwitchUsersService,
    private readonly tokenManager: TokenManagerService,
    private readonly stateStore: OAuthStateStore,
  ) {}

  getLoginUrl(accountType: AuthAccountType) {
    const result = this.oauthService.buildAuthorizationUrl({ accountType });
    this.stateStore.create(result.state, { accountType, purpose: "connect" });
    return result;
  }

  getAdminLoginUrl() {
    const result = this.oauthService.buildAdminLoginUrl();
    // accountType is irrelevant for admin login; store the purpose.
    this.stateStore.create(result.state, {
      accountType: "broadcaster",
      purpose: "admin-login",
    });
    return result;
  }

  async handleCallback(params: {
    code?: string;
    state?: string;
  }): Promise<
    | {
        kind: "connect";
        accountType: AuthAccountType;
        account: Awaited<
          ReturnType<AuthRepository["upsertAccountWithToken"]>
        >;
      }
    | {
        kind: "admin-login";
        user: { id: string; login: string; displayName: string };
      }
  > {
    if (!params.code) {
      throw new Error("Missing Twitch OAuth code");
    }

    if (!params.state) {
      throw new Error("Missing Twitch OAuth state");
    }

    const storedState = this.stateStore.consume(params.state);
    if (!storedState) {
      throw new Error("Invalid or expired Twitch OAuth state");
    }

    const tokenResponse = await this.oauthService.exchangeCodeForToken(params.code);
    const user = await this.usersService.getMe(tokenResponse.access_token);

    if (storedState.purpose === "admin-login") {
      // Identity-only flow: do NOT persist the user token. The caller checks
      // the allowlist and issues an admin session.
      return {
        kind: "admin-login",
        user: {
          id: user.id,
          login: user.login,
          displayName: user.display_name,
        },
      };
    }

    const accountType = storedState.accountType;
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    const saved = await this.repository.upsertAccountWithToken({
      providerUserId: user.id,
      login: user.login,
      displayName: user.display_name,
      accountType:
        accountType === "broadcaster" ? AccountType.broadcaster : AccountType.bot,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      scopes: tokenResponse.scope,
      expiresAt,
    });

    this.tokenManager.invalidateAccountCache(accountType);

    return {
      kind: "connect" as const,
      accountType,
      account: saved,
    };
  }

  async getAuthStatus() {
    const broadcaster = await this.repository.findAccountByType(
      AccountType.broadcaster,
    );
    const bot = await this.repository.findAccountByType(AccountType.bot);

    return {
      broadcaster: broadcaster
        ? {
            connected: true,
            id: broadcaster.id,
            providerUserId: broadcaster.providerUserId,
            login: broadcaster.login,
            displayName: broadcaster.displayName,
            scopes: broadcaster.oauthToken?.scopes ?? [],
            expiresAt: broadcaster.oauthToken?.expiresAt ?? null,
          }
        : { connected: false },
      bot: bot
        ? {
            connected: true,
            id: bot.id,
            providerUserId: bot.providerUserId,
            login: bot.login,
            displayName: bot.displayName,
            scopes: bot.oauthToken?.scopes ?? [],
            expiresAt: bot.oauthToken?.expiresAt ?? null,
          }
        : { connected: false },
    };
  }

  async refreshAccountToken(accountType: AuthAccountType) {
    this.tokenManager.invalidateAccountCache(accountType);

    const result = await this.tokenManager.getValidAccessToken(accountType);

    return {
      ok: true,
      accountType,
      login: result.login,
      scopes: result.scopes,
      expiresAt: result.expiresAt,
    };
  }
}