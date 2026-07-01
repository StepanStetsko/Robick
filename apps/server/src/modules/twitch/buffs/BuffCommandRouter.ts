import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import { EconomyService } from "../economy/EconomyService.js";
import { PresenceLogService } from "../economy/PresenceLogService.js";
import { EarningExclusionService } from "../economy/EarningExclusionService.js";
import { ProtectionRepository } from "../steal/ProtectionRepository.js";
import { BuffService } from "./BuffService.js";
import type {
  BuffEffectType,
  BuffKind,
  BuffViewerInput,
} from "./buff.types.js";

const COMMAND_PREFIX = "!";

type ParsedCommand = {
  commandName: string;
  args: string[];
};

type Settings = Awaited<ReturnType<EconomyService["getSettings"]>>;

export class BuffCommandRouter {
  private readonly rateLimitService = new RateLimitService();

  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
    private readonly buffService: BuffService,
    private readonly presenceLogService: PresenceLogService,
    private readonly protectionRepository: ProtectionRepository,
    private readonly earningExclusionService: EarningExclusionService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const settings = await this.economyService.getSettings();
    const viewer = this.getViewer(event);

    if (parsed.commandName === settings.buffRollCommand) {
      await this.handleRoll(event, viewer, settings);
      return true;
    }

    if (parsed.commandName === settings.buffListCommand) {
      await this.handleCatalog(event, settings);
      return true;
    }

    const buffSettings = await this.buffService.getSettings();

    if (parsed.commandName === buffSettings.curseCommand) {
      await this.handleCurse(event, viewer, settings);
      return true;
    }

    return false;
  }

  /**
   * Cast a random debuff on someone else: `!прокляти` picks a random present
   * viewer, `!прокляти @нік` targets a specific one. A shielded target is
   * immune (like steal). Available to everyone; per-caster cooldown + cost.
   */
  private async handleCurse(
    event: TwitchChatMessageEvent,
    caster: BuffViewerInput,
    economySettings: Settings,
  ): Promise<void> {
    const buffSettings = await this.buffService.getSettings();
    const m = buffSettings.messages;
    const casterName = this.getDisplayName(caster);

    const mentioned = this.findMentionTarget(event);
    const target = mentioned ?? (await this.pickRandomTarget(caster.twitchUserId));

    if (!target) {
      await this.sendCurse(m.noTarget, { casterName }, event);
      return;
    }

    if (target.twitchUserId === caster.twitchUserId) {
      await this.sendCurse(m.self, { casterName }, event);
      return;
    }

    // The streamer and the bot cannot be cursed.
    if (await this.earningExclusionService.isExcluded(target.twitchUserId)) {
      await this.sendCurse(m.noTarget, { casterName }, event);
      return;
    }

    // Shield immunity — same protection viewers buy against steal.
    const protection = await this.protectionRepository.getActive(
      target.twitchUserId,
      new Date(),
    );

    if (protection) {
      await this.sendCurse(
        m.shielded,
        { casterName, victimName: this.getDisplayName(target) },
        event,
      );
      return;
    }

    if (!(await this.buffService.hasEnabledDebuffs())) {
      await this.sendCurse(m.noDebuffs, { casterName }, event);
      return;
    }

    if (buffSettings.curseCost > 0) {
      const balance = await this.economyService.getBalance(caster.twitchUserId);
      if (balance < buffSettings.curseCost) {
        await this.sendCurse(
          m.insufficient,
          {
            casterName,
            cost: buffSettings.curseCost,
            balance,
            unit: economySettings.unit,
          },
          event,
        );
        return;
      }
    }

    const cooldownMs = buffSettings.curseCooldownSec * 1000;
    if (cooldownMs > 0) {
      const cooldown = this.rateLimitService.isAllowed(
        `buff:curse:${caster.twitchUserId}`,
        cooldownMs,
      );

      if (!cooldown.allowed) {
        await this.sendCurse(
          m.cooldown,
          {
            casterName,
            secondsLeft: Math.ceil(cooldown.retryAfterMs / 1000),
          },
          event,
        );
        return;
      }
    }

    try {
      if (buffSettings.curseCost > 0) {
        await this.economyService.spend(
          caster.twitchUserId,
          buffSettings.curseCost,
        );
      }

      const applied = await this.buffService.applyRandomDebuff(target);

      if (!applied) {
        await this.sendCurse(m.noDebuffs, { casterName }, event);
        return;
      }

      await this.sendCurse(
        m.cursed,
        {
          casterName,
          victimName: this.getDisplayName(target),
          title: applied.definition.title,
          effect: this.describeEffect(
            applied.definition.effectType,
            applied.definition.magnitude,
          ),
        },
        event,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        const balance = await this.economyService.getBalance(
          caster.twitchUserId,
        );
        await this.sendCurse(
          m.insufficient,
          {
            casterName,
            cost: buffSettings.curseCost,
            balance,
            unit: economySettings.unit,
          },
          event,
        );
        return;
      }

      logger.error("Curse command failed", {
        caster: caster.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Pick a random present viewer (excluding the caster, streamer and bot). */
  private async pickRandomTarget(
    casterId: string,
  ): Promise<BuffViewerInput | null> {
    const excluded = await this.earningExclusionService.getExcludedIds();

    const present = this.presenceLogService
      .list()
      .filter(
        (entry) =>
          entry.presentNow &&
          entry.twitchUserId !== casterId &&
          !excluded.has(entry.twitchUserId),
      );

    if (present.length === 0) {
      return null;
    }

    const pick = present[Math.floor(Math.random() * present.length)]!;
    return {
      twitchUserId: pick.twitchUserId,
      userLogin: pick.userLogin,
      displayName: pick.displayName,
    };
  }

  private findMentionTarget(
    event: TwitchChatMessageEvent,
  ): BuffViewerInput | null {
    for (const fragment of event.message.fragments) {
      if (fragment.type !== "mention" || !fragment.mention) {
        continue;
      }

      const mention = fragment.mention as {
        user_id?: string;
        user_login?: string;
        user_name?: string;
      };

      if (!mention.user_id || !mention.user_login) {
        continue;
      }

      return {
        twitchUserId: mention.user_id,
        userLogin: mention.user_login,
        displayName: mention.user_name || mention.user_login,
      };
    }

    return null;
  }

  private async sendCurse(
    template: string,
    values: Record<string, unknown>,
    event: TwitchChatMessageEvent,
  ): Promise<void> {
    await this.chatService.sendMessage(
      this.renderTemplate(template, values),
      event.message_id,
    );
  }

  private async handleRoll(
    event: TwitchChatMessageEvent,
    viewer: BuffViewerInput,
    settings: Settings,
  ): Promise<void> {
    const cooldownMs = settings.buffRollCooldownSec * 1000;

    if (cooldownMs > 0) {
      const cooldown = this.rateLimitService.isAllowed(
        `buff:roll:${viewer.twitchUserId}`,
        cooldownMs,
      );

      if (!cooldown.allowed) {
        await this.chatService.sendMessage(
          this.renderTemplate(settings.messages.buffRollCooldown, {
            displayName: this.getDisplayName(viewer),
            secondsLeft: Math.ceil(cooldown.retryAfterMs / 1000),
          }),
          event.message_id,
        );
        return;
      }
    }

    try {
      const result = await this.buffService.rollBuff(viewer, {
        cost: settings.buffRollCost,
        chancePercent: settings.buffRollChancePercent,
      });

      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.buffRollWon, {
          displayName: this.getDisplayName(viewer),
          kindLabel: this.kindLabel(result.definition.kind),
          title: result.definition.title,
          effect: this.describeEffect(
            result.definition.effectType,
            result.definition.magnitude,
          ),
          balance: result.balance,
          unit: settings.unit,
        }),
        event.message_id,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        const balance = await this.economyService.getBalance(
          viewer.twitchUserId,
        );

        await this.chatService.sendMessage(
          this.renderTemplate(settings.messages.buffInsufficient, {
            displayName: this.getDisplayName(viewer),
            cost: settings.buffRollCost,
            balance,
            unit: settings.unit,
          }),
          event.message_id,
        );
        return;
      }

      if (error instanceof Error && error.message === "NO_BUFFS_AVAILABLE") {
        await this.chatService.sendMessage(
          this.renderTemplate(settings.messages.buffRollEmpty, {
            displayName: this.getDisplayName(viewer),
          }),
          event.message_id,
        );
        return;
      }

      logger.error("Buff roll command failed", {
        userLogin: viewer.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleCatalog(
    event: TwitchChatMessageEvent,
    settings: Settings,
  ): Promise<void> {
    const definitions = (await this.buffService.listDefinitions()).filter(
      (definition) => definition.enabled,
    );

    if (definitions.length === 0) {
      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.buffCatalogEmpty, {}),
        event.message_id,
      );
      return;
    }

    const lines = definitions.map((definition) =>
      this.renderTemplate(settings.messages.buffCatalogEntry, {
        title: definition.title,
        kindLabel: this.kindLabel(definition.kind),
        effect: this.describeEffect(
          definition.effectType,
          definition.magnitude,
        ),
      }),
    );

    const message = [
      this.renderTemplate(settings.messages.buffCatalogTitle, {}),
      ...lines,
    ].join("\n");

    await this.chatService.sendMessage(message, event.message_id);
  }

  private kindLabel(kind: BuffKind): string {
    return kind === "debuff" ? "дебаф" : "баф";
  }

  private describeEffect(
    effectType: BuffEffectType,
    magnitude: number,
  ): string {
    switch (effectType) {
      case "chance":
        return `${magnitude >= 0 ? "+" : ""}${magnitude}% шансу`;
      case "multiplier":
        return `×${magnitude / 100}`;
      case "flat":
        return `${magnitude >= 0 ? "+" : ""}${magnitude}`;
      case "guarantee":
        return magnitude >= 0 ? "гарантований плюс" : "гарантований мінус";
      case "no_earn":
        return "стоп-заробіток";
      default:
        return String(magnitude);
    }
  }

  private parse(messageText: string): ParsedCommand | null {
    const trimmed = messageText.trim();

    if (!trimmed.startsWith(COMMAND_PREFIX)) {
      return null;
    }

    const withoutPrefix = trimmed.slice(COMMAND_PREFIX.length).trim();

    if (!withoutPrefix) {
      return null;
    }

    const [rawCommandName, ...rawArgs] = withoutPrefix.split(/\s+/);
    const commandName = rawCommandName?.toLocaleLowerCase();

    if (!commandName) {
      return null;
    }

    return {
      commandName,
      args: rawArgs,
    };
  }

  private getViewer(event: TwitchChatMessageEvent): BuffViewerInput {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }

  private getDisplayName(viewer: BuffViewerInput): string {
    return viewer.displayName?.trim() || viewer.userLogin;
  }

  private renderTemplate(
    template: string,
    values: Record<string, unknown>,
  ): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];

      if (value === undefined || value === null) {
        return match;
      }

      return String(value);
    });
  }
}
