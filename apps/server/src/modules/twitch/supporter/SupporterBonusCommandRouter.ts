import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { EconomyService } from "../economy/EconomyService.js";
import { SupporterService } from "./SupporterService.js";
import type { SupporterMessages, SupporterTier } from "./supporter.types.js";

const COMMAND_PREFIX = "!";

/**
 * Handles the daily-bonus command (e.g. !бонус): once per cooldown, awards the
 * viewer's tier daily bonus plus a streak bonus (if they have a running
 * streak). Command name, amounts and all replies are read live from settings.
 */
export class SupporterBonusCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly supporterService: SupporterService,
    private readonly economyService: EconomyService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const text = event.message.text.trim();

    if (!text.startsWith(COMMAND_PREFIX)) {
      return false;
    }

    const withoutPrefix = text.slice(COMMAND_PREFIX.length).trim();
    const commandName = withoutPrefix.split(/\s+/)[0]?.toLocaleLowerCase();

    if (!commandName) {
      return false;
    }

    const settings = await this.supporterService.getSettings();

    if (commandName !== settings.bonusCommand) {
      return false;
    }

    const messages = settings.messages;
    const displayName = event.chatter_user_name || event.chatter_user_login;
    const login = event.chatter_user_login;

    if (!settings.enabled) {
      await this.reply(messages.bonusDisabled, { displayName }, event);
      return true;
    }

    const ctx = await this.supporterService.getBonusContext(login);

    if (ctx.lastBonusAt) {
      const elapsedMs = Date.now() - ctx.lastBonusAt.getTime();
      const cooldownMs = ctx.cooldownSec * 1000;
      if (elapsedMs < cooldownMs) {
        await this.reply(
          messages.bonusCooldown,
          { displayName, timeLeft: formatDuration(cooldownMs - elapsedMs) },
          event,
        );
        return true;
      }
    }

    const streakComponent = ctx.streakDays > 0 ? ctx.streakBonus : 0;
    const amount = ctx.dailyBonus + streakComponent;

    if (amount <= 0) {
      await this.reply(messages.bonusDisabled, { displayName }, event);
      return true;
    }

    const now = new Date();
    await this.economyService.award(
      {
        twitchUserId: event.chatter_user_id,
        userLogin: login,
        displayName,
      },
      amount,
      "supporter.bonus",
    );
    await this.supporterService.recordBonusClaim(login, now, {
      twitchUserId: event.chatter_user_id,
      displayName,
    });

    const economySettings = await this.economyService.getSettings();

    await this.reply(
      messages.bonusClaimed,
      {
        displayName,
        amount,
        unit: economySettings.unit,
        tier: tierLabel(ctx.tier, messages),
      },
      event,
    );
    return true;
  }

  private async reply(
    template: string,
    values: Record<string, unknown>,
    event: TwitchChatMessageEvent,
  ): Promise<void> {
    const message = template.replace(
      /\{([a-zA-Z0-9_]+)\}/g,
      (match, key: string) => {
        const value = values[key];
        return value === undefined || value === null ? match : String(value);
      },
    );
    await this.chatService.sendMessage(message, event.message_id);
  }
}

function tierLabel(tier: SupporterTier, messages: SupporterMessages): string {
  if (tier === "supporter") {
    return messages.tierSupporter;
  }
  if (tier === "loyal") {
    return messages.tierLoyal;
  }
  return messages.tierGuest;
}

/** Human-friendly Ukrainian duration for the cooldown message. */
function formatDuration(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
  }
  if (minutes > 0) {
    return `${minutes} хв`;
  }
  return `${seconds} с`;
}
