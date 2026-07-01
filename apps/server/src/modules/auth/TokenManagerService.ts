import { AccountType } from "@prisma/client";
import { AuthRepository } from "./AuthRepository.js";
import { TwitchOAuthService } from "./TwitchOAuthService.js";
import type { AuthAccountType } from "./auth.types.js";

type ResolvedToken = {
  accountType: AuthAccountType;
  twitchAccountId: string;
  providerUserId: string;
  login: string;
  accessToken: string;
  scopes: string[];
  expiresAt: Date;
};

type CachedTokenEntry = {
  value: ResolvedToken;
  cachedAt: number;
};

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const TOKEN_CACHE_TTL_MS = 60 * 1000;

export class TokenManagerService {
  private readonly tokenCache = new Map<AuthAccountType, CachedTokenEntry>();
  private readonly refreshInFlight = new Map<AuthAccountType, Promise<ResolvedToken>>();

  constructor(
    private readonly repository: AuthRepository,
    private readonly oauthService: TwitchOAuthService,
  ) {}

  async getValidAccessToken(accountType: AuthAccountType): Promise<ResolvedToken> {
    const cached = this.tokenCache.get(accountType);

    if (cached && this.isTokenUsable(cached.value.expiresAt, TOKEN_REFRESH_BUFFER_MS)) {
      if (Date.now() - cached.cachedAt < TOKEN_CACHE_TTL_MS) {
        return cached.value;
      }
    }

    const inFlight = this.refreshInFlight.get(accountType);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.resolveToken(accountType);

    this.refreshInFlight.set(accountType, promise);

    try {
      const resolved = await promise;
      this.tokenCache.set(accountType, {
        value: resolved,
        cachedAt: Date.now(),
      });
      return resolved;
    } finally {
      this.refreshInFlight.delete(accountType);
    }
  }

  invalidateAccountCache(accountType: AuthAccountType) {
    this.tokenCache.delete(accountType);
  }

  private async resolveToken(accountType: AuthAccountType): Promise<ResolvedToken> {
    const account = await this.repository.findAccountByType(
      accountType === "broadcaster" ? AccountType.broadcaster : AccountType.bot,
    );

    if (!account?.oauthToken) {
      throw new Error(`No OAuth token found for ${accountType}`);
    }

    const currentExpiresAt = account.oauthToken.expiresAt;

    if (this.isTokenUsable(currentExpiresAt, TOKEN_REFRESH_BUFFER_MS)) {
      return {
        accountType,
        twitchAccountId: account.id,
        providerUserId: account.providerUserId,
        login: account.login,
        accessToken: account.oauthToken.accessToken,
        scopes: account.oauthToken.scopes,
        expiresAt: currentExpiresAt,
      };
    }

    const refreshed = await this.oauthService.refreshAccessToken(
      account.oauthToken.refreshToken,
    );

    const refreshedExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await this.repository.updateTokenByAccountId(account.id, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      scopes: refreshed.scope,
      expiresAt: refreshedExpiresAt,
    });

    return {
      accountType,
      twitchAccountId: account.id,
      providerUserId: account.providerUserId,
      login: account.login,
      accessToken: refreshed.access_token,
      scopes: refreshed.scope,
      expiresAt: refreshedExpiresAt,
    };
  }

  private isTokenUsable(expiresAt: Date, bufferMs: number) {
    return expiresAt.getTime() - Date.now() > bufferMs;
  }
}