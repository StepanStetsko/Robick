import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { EconomyService } from "../economy/EconomyService.js";
import { FightService, type FightViewer } from "./FightService.js";

const COMMAND_PREFIX = "!";

type ParsedCommand = {
  commandName: string;
  args: string[];
};

export class FightCommandRouter {
  constructor(
    private readonly economyService: EconomyService,
    private readonly fightService: FightService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const settings = await this.economyService.getSettings();
    const viewer = this.getViewer(event);

    if (parsed.commandName === settings.fightCommand) {
      const target = this.findMentionTarget(event);
      const cleanTarget =
        target && target.twitchUserId !== event.broadcaster_user_id ? target : null;

      await this.fightService.requestFight(
        viewer,
        cleanTarget,
        parsed.args.find((arg) => !arg.startsWith("@")),
        settings,
        event.message_id,
      );
      return true;
    }

    if (parsed.commandName === settings.fightAcceptCommand) {
      // Only treat as handled if this viewer actually has a pending challenge.
      if (this.fightService.hasPendingFor(viewer.twitchUserId)) {
        await this.fightService.accept(viewer, settings);
        return true;
      }
      return false;
    }

    return false;
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

  private findMentionTarget(event: TwitchChatMessageEvent): FightViewer | null {
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

  private getViewer(event: TwitchChatMessageEvent): FightViewer {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }
}
