import { logger } from "../../../core/logger/logger.js";
import { ChatCommandActionDispatcher } from "../commands/ChatCommandActionDispatcher.js";
import { ChatCommandRouter } from "../commands/ChatCommandRouter.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { CustomChatCommandService } from "../commands/custom/CustomChatCommandService.js";
import { FunMeterCommandRouter } from "../fun-meter/FunMeterCommandRouter.js";
import { EconomyService } from "../economy/EconomyService.js";
import { EconomyCommandRouter } from "../economy/EconomyCommandRouter.js";
import { ChatActivityTracker } from "../economy/ChatActivityTracker.js";
import { BuffCommandRouter } from "../buffs/BuffCommandRouter.js";
import { BuffService } from "../buffs/BuffService.js";
import { GiveawayCommandRouter } from "../giveaway/GiveawayCommandRouter.js";
import { StatusCommandRouter } from "../economy/StatusCommandRouter.js";
import { RouletteCommandRouter } from "../roulette/RouletteCommandRouter.js";
import { StealCommandRouter } from "../steal/StealCommandRouter.js";
import { StealService } from "../steal/StealService.js";
import { GuessGameCommandRouter } from "../guess/GuessGameCommandRouter.js";
import { FightCommandRouter } from "../fights/FightCommandRouter.js";
import { HelpCommandRouter } from "../economy/HelpCommandRouter.js";
import { SongRequestCommandRouter } from "../song-request/SongRequestCommandRouter.js";
import { PresenceLogService } from "../economy/PresenceLogService.js";
import { EarningExclusionService } from "../economy/EarningExclusionService.js";
import { TwitchRuntimeState } from "../runtime/TwitchRuntimeState.js";
import { SupporterService } from "../supporter/SupporterService.js";
import { SupporterBonusCommandRouter } from "../supporter/SupporterBonusCommandRouter.js";

export class ChatMessageHandler {
  private readonly rateLimitService = new RateLimitService();
  private readonly commandRouter: ChatCommandRouter;

  constructor(
    private readonly chatService: TwitchChatService,
    customCommandService: CustomChatCommandService,
    actionDispatcher: ChatCommandActionDispatcher,
    private readonly funMeterCommandRouter: FunMeterCommandRouter,
    private readonly economyService: EconomyService,
    private readonly economyCommandRouter: EconomyCommandRouter,
    private readonly chatActivityTracker: ChatActivityTracker,
    private readonly buffCommandRouter: BuffCommandRouter,
    private readonly giveawayCommandRouter: GiveawayCommandRouter,
    private readonly statusCommandRouter: StatusCommandRouter,
    private readonly buffService: BuffService,
    private readonly rouletteCommandRouter: RouletteCommandRouter,
    private readonly stealCommandRouter: StealCommandRouter,
    private readonly guessGameCommandRouter: GuessGameCommandRouter,
    private readonly helpCommandRouter: HelpCommandRouter,
    private readonly presenceLogService: PresenceLogService,
    private readonly stealService: StealService,
    private readonly fightCommandRouter: FightCommandRouter,
    private readonly earningExclusion: EarningExclusionService,
    private readonly runtimeState: TwitchRuntimeState,
    private readonly songRequestCommandRouter: SongRequestCommandRouter,
    private readonly supporterService: SupporterService,
    private readonly supporterBonusCommandRouter: SupporterBonusCommandRouter,
  ) {
    this.commandRouter = new ChatCommandRouter(
      chatService,
      customCommandService,
      actionDispatcher,
    );
  }

  async handle(
    event: TwitchChatMessageEvent,
    options?: { bypassChatCooldown?: boolean },
  ) {
    this.chatActivityTracker.touch(event.chatter_user_id);

    // Viewer statistics are only collected while the stream is live.
    if (this.runtimeState.isStreamLive()) {
      this.presenceLogService.recordChat(
        event.chatter_user_id,
        event.chatter_user_login,
        event.chatter_user_name || event.chatter_user_login,
      );
    }

    // Writing in chat foils any pending steal targeting this viewer.
    await this.stealService.notifyActivity(event.chatter_user_id);

    if (!options?.bypassChatCooldown) {
      const userCooldown = this.rateLimitService.isAllowed(
        `chat:user:${event.chatter_user_id}`,
        1500,
      );

      if (!userCooldown.allowed) {
        logger.warn("Chat message skipped by user cooldown", {
          userId: event.chatter_user_id,
          userLogin: event.chatter_user_login,
          retryAfterMs: userCooldown.retryAfterMs,
        });
        return;
      }

      const normalizedText = event.message.text.trim().toLowerCase();

      if (normalizedText.length > 0) {
        const duplicateMessageCooldown = this.rateLimitService.isAllowed(
          `chat:user-message:${event.chatter_user_id}:${normalizedText}`,
          4000,
        );

        if (!duplicateMessageCooldown.allowed) {
          logger.warn("Chat message skipped as repeated spam", {
            userId: event.chatter_user_id,
            userLogin: event.chatter_user_login,
            text: event.message.text,
            retryAfterMs: duplicateMessageCooldown.retryAfterMs,
          });
          return;
        }
      }
    }

    logger.info("Chat message received", {
      userId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      text: event.message.text,
    });

    await this.awardChatActivity(event);
    await this.maybeGreet(event);

    const funMeterHandled = await this.funMeterCommandRouter.handle(event);

    if (funMeterHandled) {
      logger.info("ChatMessageHandler fun meter command handled", {
        text: event.message.text,
      });
      return;
    }

    const rouletteHandled = await this.rouletteCommandRouter.handle(event);

    if (rouletteHandled) {
      return;
    }

    const stealHandled = await this.stealCommandRouter.handle(event);

    if (stealHandled) {
      return;
    }

    const fightHandled = await this.fightCommandRouter.handle(event);

    if (fightHandled) {
      return;
    }

    const guessHandled = await this.guessGameCommandRouter.handle(event);

    if (guessHandled) {
      return;
    }

    const economyHandled = await this.economyCommandRouter.handle(event);

    if (economyHandled) {
      return;
    }

    const statusHandled = await this.statusCommandRouter.handle(event);

    if (statusHandled) {
      return;
    }

    const helpHandled = await this.helpCommandRouter.handle(event);

    if (helpHandled) {
      return;
    }

    const buffHandled = await this.buffCommandRouter.handle(event);

    if (buffHandled) {
      return;
    }

    const giveawayHandled = await this.giveawayCommandRouter.handle(event);

    if (giveawayHandled) {
      return;
    }

    const songRequestHandled = await this.songRequestCommandRouter.handle(event);

    if (songRequestHandled) {
      return;
    }

    const bonusHandled = await this.supporterBonusCommandRouter.handle(event);

    if (bonusHandled) {
      return;
    }

    const commandHandled = await this.commandRouter.handle(event);

    logger.info("ChatMessageHandler after command router", {
      text: event.message.text,
      commandHandled,
    });

    if (commandHandled) {
      return;
    }

    console.log("🔥 CHAT:", event.chatter_user_login, ":", event.message.text);
  }

  /** Greet loyal/supporter viewers on their first message of the stream day. */
  private async maybeGreet(event: TwitchChatMessageEvent): Promise<void> {
    try {
      if (!this.runtimeState.isStreamLive()) {
        return;
      }
      if (await this.earningExclusion.isExcluded(event.chatter_user_id)) {
        return;
      }

      const greeting = await this.supporterService.maybeGreet(
        event.chatter_user_login,
        event.chatter_user_name || event.chatter_user_login,
      );

      if (greeting) {
        await this.chatService.sendMessage(greeting);
      }
    } catch (error) {
      logger.error("Supporter greeting failed", {
        userId: event.chatter_user_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async awardChatActivity(event: TwitchChatMessageEvent): Promise<void> {
    try {
      // No passive earning while the stream is offline.
      if (!this.runtimeState.isStreamLive()) {
        return;
      }

      // The broadcaster and the bot don't earn currency.
      if (await this.earningExclusion.isExcluded(event.chatter_user_id)) {
        return;
      }

      const settings = await this.economyService.getSettings();

      if (settings.chatActivityPoints <= 0) {
        return;
      }

      const earnCooldown = this.rateLimitService.isAllowed(
        `economy:earn:${event.chatter_user_id}`,
        settings.chatActivityCooldownSec * 1000,
      );

      if (!earnCooldown.allowed) {
        return;
      }

      const multiplier = await this.buffService.resolveEarningMultiplier(
        event.chatter_user_id,
      );
      const perks = await this.supporterService.resolvePerks(
        event.chatter_user_login,
      );
      const amount = Math.floor(
        settings.chatActivityPoints * multiplier * perks.earnMultiplier,
      );

      if (amount < 1) {
        return;
      }

      await this.economyService.award(
        {
          twitchUserId: event.chatter_user_id,
          userLogin: event.chatter_user_login,
          displayName: event.chatter_user_name || event.chatter_user_login,
        },
        amount,
        "chat.activity",
      );
    } catch (error) {
      logger.error("Economy chat-activity award failed", {
        userId: event.chatter_user_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
