import { AuthRepository } from "./AuthRepository.js";
import { TokenManagerService } from "./TokenManagerService.js";
import { TwitchOAuthService } from "./TwitchOAuthService.js";
import { logger } from "../../core/logger/logger.js";
import { AccountType } from "../../generated/prisma/client.js";
import { twitchRealtimeHub } from "../twitch/realtime/twitch-realtime-hub.js";

const TOKEN_REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

export class TokenRefreshService {
  private interval: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(
    private readonly repository: AuthRepository,
    private readonly tokenManager: TokenManagerService,
  ) {}

  start() {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      void this.refreshAllSafely();
    }, TOKEN_REFRESH_CHECK_INTERVAL_MS);

    if (typeof this.interval.unref === "function") {
      this.interval.unref();
    }

    logger.info("Token refresh service started", {
      checkIntervalMs: TOKEN_REFRESH_CHECK_INTERVAL_MS,
    });
  }

  stop() {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;

    logger.info("Token refresh service stopped");
  }

  async refreshAllSafely() {
    if (this.isRefreshing) {
      logger.warn("Token refresh tick skipped: previous run is still in progress");
      return;
    }

    this.isRefreshing = true;

    try {
      const accounts = await this.repository.findAllAccountsWithTokens();

      if (accounts.length === 0) {
        logger.info("Token refresh check skipped: no connected Twitch accounts");
        return;
      }

      let authStatusShouldBePublished = false;

      for (const account of accounts) {
        if (!account.oauthToken) {
          continue;
        }

        const accountType =
          account.accountType === "broadcaster" ? "broadcaster" : "bot";

        try {
          const beforeExpiresAt = account.oauthToken.expiresAt;

          const result = await this.tokenManager.getValidAccessToken(accountType);

          const wasRefreshed =
            beforeExpiresAt.getTime() !== result.expiresAt.getTime();

          if (wasRefreshed) {
            authStatusShouldBePublished = true;
          }

          logger.info("Token refresh check completed", {
            accountType,
            login: account.login,
            wasRefreshed,
            previousExpiresAt: beforeExpiresAt.toISOString(),
            currentExpiresAt: result.expiresAt.toISOString(),
          });
        } catch (error) {
          logger.error(`Failed to refresh token for ${accountType}`, error);
        }
      }

      if (authStatusShouldBePublished) {
        const [broadcaster, bot] = await Promise.all([
          this.repository.findAccountByType(AccountType.broadcaster),
          this.repository.findAccountByType(AccountType.bot),
        ]);

        twitchRealtimeHub.publish("auth.status", {
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
        });
      }
    } finally {
      this.isRefreshing = false;
    }
  }
}

export function createTokenRefreshService() {
  const repository = new AuthRepository();
  const oauthService = new TwitchOAuthService();
  const tokenManager = new TokenManagerService(repository, oauthService);

  return new TokenRefreshService(repository, tokenManager);
}