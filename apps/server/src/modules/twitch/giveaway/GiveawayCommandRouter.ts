import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { GiveawayService } from "./GiveawayService.js";
import type { GiveawayViewerInput } from "./giveaway.types.js";

const COMMAND_PREFIX = "!";

type ParsedCommand = {
  commandName: string;
  args: string[];
};

export class GiveawayCommandRouter {
  constructor(private readonly giveawayService: GiveawayService) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const settings = await this.giveawayService.getSettings();
    const viewer = this.getViewer(event);

    if (parsed.commandName === settings.joinKeyword) {
      this.giveawayService.join(viewer);
      return true;
    }

    if (parsed.commandName === settings.selfCommand) {
      await this.giveawayService.requestStartSelf(
        viewer,
        parsed.args[0],
        event.message_id,
      );
      return true;
    }

    const preset = settings.presets.find(
      (item) => item.enabled && item.commandName === parsed.commandName,
    );

    if (preset) {
      await this.giveawayService.requestStart(
        viewer,
        preset,
        parsed.args[0],
        event.message_id,
        this.isPrivileged(event),
      );
      return true;
    }

    return false;
  }

  private isPrivileged(event: TwitchChatMessageEvent): boolean {
    if (event.chatter_user_id === event.broadcaster_user_id) {
      return true;
    }

    return (event.badges ?? []).some(
      (badge) => badge.set_id === "moderator" || badge.set_id === "broadcaster",
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

    return {
      commandName,
      args: rawArgs,
    };
  }

  private getViewer(event: TwitchChatMessageEvent): GiveawayViewerInput {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }
}
