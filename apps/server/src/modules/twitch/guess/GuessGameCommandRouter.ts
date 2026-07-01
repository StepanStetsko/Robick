import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { GuessGameService } from "./GuessGameService.js";
import type { GuessGameViewerInput } from "./guess.types.js";

const COMMAND_PREFIX = "!";

type ParsedCommand = {
  commandName: string;
  args: string[];
};

export class GuessGameCommandRouter {
  constructor(private readonly guessGameService: GuessGameService) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const text = event.message.text.trim();
    const viewer = this.getViewer(event);

    // Command path: start / stop. Only here do we touch settings (one DB read),
    // so ordinary chat lines don't trigger a lookup.
    if (text.startsWith(COMMAND_PREFIX)) {
      const parsed = this.parse(text);

      if (!parsed) {
        return false;
      }

      const settings = await this.guessGameService.getSettings();

      if (parsed.commandName === settings.command) {
        await this.guessGameService.requestStart(
          viewer,
          parsed.args,
          event.message_id,
          this.isPrivileged(event),
        );
        return true;
      }

      if (parsed.commandName === settings.stopCommand) {
        await this.guessGameService.stopByCommand(
          viewer,
          event.message_id,
          this.isPrivileged(event),
        );
        return true;
      }

      return false;
    }

    // Guess path: while a round is active, a bare integer message is a guess.
    if (this.guessGameService.isRunning() && /^\d+$/.test(text)) {
      return this.guessGameService.submitGuess(viewer, Number.parseInt(text, 10));
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
    const withoutPrefix = messageText.slice(COMMAND_PREFIX.length).trim();

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

  private getViewer(event: TwitchChatMessageEvent): GuessGameViewerInput {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }
}
