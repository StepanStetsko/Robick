import { logger } from "../../core/logger/logger.js";
import { AuthRepository } from "../auth/AuthRepository.js";
import { TwitchApiClient } from "./TwitchApiClient.js";
import { TwitchChatService } from "./TwitchChatService.js";
import { TwitchEventSubClient } from "./TwitchEventSubClient.js";
import { TwitchSubscriptionService } from "./TwitchSubscriptionService.js";
import { CustomChatCommandService } from "./commands/custom/CustomChatCommandService.js";
import { TwitchRuntimeState } from "./runtime/TwitchRuntimeState.js";
import { PresenceEarningService } from "./economy/PresenceEarningService.js";
import { GiveawayService } from "./giveaway/GiveawayService.js";
import { GuessGameService } from "./guess/GuessGameService.js";
import { PresenceLogService } from "./economy/PresenceLogService.js";
import { StealService } from "./steal/StealService.js";
import { FightService } from "./fights/FightService.js";
import { LeaderLockService } from "./roulette/LeaderLockService.js";

export class TwitchRuntimeService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly twitchApiClient: TwitchApiClient,
    private readonly twitchChatService: TwitchChatService,
    private readonly customChatCommandService: CustomChatCommandService,
    private readonly subscriptionService: TwitchSubscriptionService,
    private readonly botEventSubClient: TwitchEventSubClient,
    private readonly broadcasterEventSubClient: TwitchEventSubClient,
    private readonly runtimeState: TwitchRuntimeState,
    private readonly presenceEarningService: PresenceEarningService,
    private readonly giveawayService: GiveawayService,
    private readonly guessGameService: GuessGameService,
    private readonly presenceLogService: PresenceLogService,
    private readonly stealService: StealService,
    private readonly fightService: FightService,
    private readonly leaderLockService: LeaderLockService,
  ) {}

  async start() {
    const [broadcaster, bot] = await Promise.all([
      this.authRepository.findAccountByType("broadcaster"),
      this.authRepository.findAccountByType("bot"),
    ]);

    this.runtimeState.setAccountsConnected({
      broadcasterConnected: Boolean(broadcaster),
      botConnected: Boolean(bot),
    });

    if (!broadcaster || !bot) {
      this.runtimeState.setRuntimeStarted(false);
      this.runtimeState.resetSessions();

      logger.warn("Twitch runtime not started: broadcaster or bot not connected");
      return this.runtimeState.getStatus();
    }

    logger.info("Starting Twitch runtime (dual EventSub connections)");

    this.runtimeState.setRuntimeStarted(true);
    this.runtimeState.resetSessions();

    try {
      await this.botEventSubClient.connect();
      await this.broadcasterEventSubClient.connect();

      await this.presenceLogService.init();
      this.leaderLockService.reset();
      this.presenceEarningService.start();

      // Resolve the current live state (the stream may already be live when the
      // bot starts); stream.online/offline EventSub keeps it updated afterwards.
      void this.refreshLiveStatus();

      this.runtimeState.touchEvent();

      return this.runtimeState.getStatus();
    } catch (error: unknown) {
      this.runtimeState.setRuntimeStarted(false);
      this.runtimeState.resetSessions();

      logger.error("Failed to start Twitch runtime", error);
      throw error;
    }
  }

  private async refreshLiveStatus(): Promise<void> {
    try {
      const broadcaster =
        await this.authRepository.findAccountByType("broadcaster");

      if (!broadcaster) {
        return;
      }

      const live = await this.twitchApiClient.getStreamLive(
        broadcaster.providerUserId,
      );
      this.runtimeState.setStreamLive(live);
    } catch (error) {
      logger.error("Failed to resolve initial stream status", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async stop() {
    logger.info("Stopping Twitch runtime");

    this.runtimeState.setRuntimeStarted(false);
    this.runtimeState.setStreamLive(false);

    this.presenceEarningService.stop();
    this.giveawayService.stop();
    this.guessGameService.stop();
    this.stealService.clearPending();
    this.fightService.stop();

    await Promise.all([
      this.botEventSubClient.disconnect(),
      this.broadcasterEventSubClient.disconnect(),
    ]);

    this.runtimeState.resetSessions();
    this.runtimeState.touchEvent();

    return this.runtimeState.getStatus();
  }

  async getStatus() {
    const [broadcaster, bot] = await Promise.all([
      this.authRepository.findAccountByType("broadcaster"),
      this.authRepository.findAccountByType("bot"),
    ]);

    this.runtimeState.setAccountsConnected({
      broadcasterConnected: Boolean(broadcaster),
      botConnected: Boolean(bot),
    });

    return this.runtimeState.getStatus();
  }
}