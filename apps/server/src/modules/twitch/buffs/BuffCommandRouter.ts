import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import { EconomyService } from "../economy/EconomyService.js";
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

    return false;
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
