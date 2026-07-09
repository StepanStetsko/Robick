import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { EconomyService } from "../economy/EconomyService.js";
import { TwitchRuntimeState } from "../runtime/TwitchRuntimeState.js";
import { StealService, type StealViewer } from "./StealService.js";

const COMMAND_PREFIX = "!";

type ParsedCommand = {
  commandName: string;
  args: string[];
};

type Settings = Awaited<ReturnType<EconomyService["getSettings"]>>;

export class StealCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
    private readonly stealService: StealService,
    private readonly runtimeState: TwitchRuntimeState,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const settings = await this.economyService.getSettings();

    if (parsed.commandName === settings.stealCommand) {
      await this.handleSteal(event, settings);
      return true;
    }

    if (parsed.commandName === settings.shieldCommand) {
      await this.handleShield(event, settings);
      return true;
    }

    return false;
  }

  private async handleSteal(
    event: TwitchChatMessageEvent,
    settings: Settings,
  ): Promise<void> {
    const thief = this.getViewer(event);

    // Крадіжка доступна лише під час стріму (як і пасивний заробіток).
    if (!this.runtimeState.isStreamLive()) {
      await this.send(
        settings.messages.stealOffline,
        { displayName: thief.displayName },
        event,
      );
      return;
    }

    const target = this.findMentionTarget(event);

    if (!target || target.twitchUserId === event.broadcaster_user_id) {
      await this.send(
        settings.messages.stealNoTarget,
        { displayName: thief.displayName, stealCommand: settings.stealCommand },
        event,
      );
      return;
    }

    try {
      // The service validates, tags the victim, arms the warning timer and
      // sends all steal-related messages (including the deferred resolution).
      await this.stealService.requestSteal(
        thief,
        target,
        settings,
        event.message_id,
      );
    } catch (error) {
      logger.error("Steal command failed", {
        thief: thief.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleShield(
    event: TwitchChatMessageEvent,
    settings: Settings,
  ): Promise<void> {
    const viewer = this.getViewer(event);

    try {
      const outcome = await this.stealService.buyShield(viewer, settings);

      switch (outcome.kind) {
        case "bought":
          await this.send(
            settings.messages.shieldBought,
            {
              displayName: viewer.displayName,
              minutes: outcome.minutes,
              balance: outcome.balance,
              unit: settings.unit,
            },
            event,
          );
          return;
        case "already_active":
          await this.send(
            settings.messages.shieldAlreadyActive,
            { displayName: viewer.displayName, secondsLeft: outcome.secondsLeft },
            event,
          );
          return;
        case "insufficient":
        default:
          await this.send(
            settings.messages.shieldInsufficient,
            {
              displayName: viewer.displayName,
              cost: outcome.cost,
              balance: outcome.balance,
              unit: settings.unit,
            },
            event,
          );
          return;
      }
    } catch (error) {
      logger.error("Shield command failed", {
        userLogin: viewer.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async send(
    template: string,
    values: Record<string, unknown>,
    event: TwitchChatMessageEvent,
  ): Promise<void> {
    await this.chatService.sendMessage(
      this.renderTemplate(template, values),
      event.message_id,
    );
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

    return { commandName, args: rawArgs };
  }

  private findMentionTarget(event: TwitchChatMessageEvent): StealViewer | null {
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

  private getViewer(event: TwitchChatMessageEvent): StealViewer {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
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
