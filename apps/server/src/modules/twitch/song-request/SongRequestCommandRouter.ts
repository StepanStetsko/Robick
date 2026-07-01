import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { SupporterService } from "../supporter/SupporterService.js";
import { SongQueueService } from "./SongQueueService.js";
import type { SongRequestSettingsDto } from "./song-request.types.js";

const COMMAND_PREFIX = "!";

/**
 * Handles the song-request command (e.g. !пісня <youtube-url>): parses the
 * link, enqueues it via SongQueueService, and replies with a configurable
 * message. Command name and all replies are read live from settings.
 * Supporters' requests get a priority (queue-jump), just like a donation.
 */
export class SongRequestCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly queueService: SongQueueService,
    private readonly supporterService: SupporterService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const text = event.message.text.trim();

    if (!text.startsWith(COMMAND_PREFIX)) {
      return false;
    }

    const withoutPrefix = text.slice(COMMAND_PREFIX.length).trim();
    const [rawCommandName, ...rest] = withoutPrefix.split(/\s+/);
    const commandName = rawCommandName?.toLocaleLowerCase();

    if (!commandName) {
      return false;
    }

    const settings = await this.queueService.getSettings();
    const displayName = event.chatter_user_name || event.chatter_user_login;

    if (commandName === settings.voteSkipCommand) {
      return this.handleSkip(event, settings, displayName);
    }

    if (commandName === settings.pauseCommand) {
      return this.handlePause(event, settings, displayName);
    }

    if (commandName !== settings.command) {
      return false;
    }

    const url = rest.join(" ").trim();

    const priority = await this.supporterService.resolveSongPriority(
      event.chatter_user_login,
    );

    const result = await this.queueService.enqueue({
      url,
      requestedBy: displayName,
      requesterId: event.chatter_user_id,
      source: "chat",
      priority,
    });

    const messages = settings.messages;
    let message: string;

    if (result.ok) {
      message = this.render(messages.added, {
        displayName,
        title: result.entry.title ?? url,
        position: result.position,
        command: settings.command,
      });
    } else {
      switch (result.reason) {
        case "disabled":
          message = this.render(messages.disabled, { displayName });
          break;
        case "invalidUrl":
          message = this.render(messages.invalidUrl, {
            displayName,
            command: settings.command,
          });
          break;
        case "queueFull":
          message = this.render(messages.queueFull, {
            displayName,
            max: settings.maxQueuePerUser,
          });
          break;
        case "cooldown":
          message = this.render(messages.cooldown, {
            displayName,
            secondsLeft: result.secondsLeft ?? 0,
          });
          break;
        case "duplicate":
          message = this.render(messages.duplicate, { displayName });
          break;
        case "blocked":
          message = this.render(messages.blocked, { displayName });
          break;
        case "tooLong":
          message = this.render(messages.tooLong, {
            displayName,
            durationSec: result.durationSec ?? 0,
            durationMin: Math.ceil((result.durationSec ?? 0) / 60),
            maxSec: result.maxDurationSec ?? 0,
            maxMin: Math.ceil((result.maxDurationSec ?? 0) / 60),
          });
          break;
        default:
          message = this.render(messages.invalidUrl, {
            displayName,
            command: settings.command,
          });
      }
    }

    await this.chatService.sendMessage(message, event.message_id);
    return true;
  }

  /** Vote-skip (viewers) / instant skip (mods & streamer). */
  private async handleSkip(
    event: TwitchChatMessageEvent,
    settings: SongRequestSettingsDto,
    displayName: string,
  ): Promise<boolean> {
    const messages = settings.messages;

    if (this.isPrivileged(event)) {
      const state = await this.queueService.getQueueState();
      if (!state.current) {
        await this.chatService.sendMessage(
          this.render(messages.nothingPlaying, { displayName }),
          event.message_id,
        );
        return true;
      }
      await this.queueService.skipCurrent();
      await this.chatService.sendMessage(
        this.render(messages.modSkipped, { displayName }),
        event.message_id,
      );
      return true;
    }

    const res = await this.queueService.voteSkip(event.chatter_user_id);
    let message: string;

    if (res.reason === "noCurrent") {
      message = this.render(messages.nothingPlaying, { displayName });
    } else if (res.reason === "already") {
      message = this.render(messages.voteAlready, {
        displayName,
        votes: res.votes,
        needed: res.needed,
      });
    } else if (res.skipped) {
      message = this.render(messages.voteSkipped, {
        votes: res.votes,
        needed: res.needed,
      });
    } else {
      message = this.render(messages.voteProgress, {
        displayName,
        votes: res.votes,
        needed: res.needed,
        left: Math.max(0, res.needed - res.votes),
      });
    }

    await this.chatService.sendMessage(message, event.message_id);
    return true;
  }

  /** Pause / resume — mods & streamer only (viewers are silently ignored). */
  private async handlePause(
    event: TwitchChatMessageEvent,
    settings: SongRequestSettingsDto,
    displayName: string,
  ): Promise<boolean> {
    if (!this.isPrivileged(event)) {
      return true;
    }

    const state = await this.queueService.togglePause();
    const message = this.render(
      state.paused ? settings.messages.paused : settings.messages.resumed,
      { displayName },
    );
    await this.chatService.sendMessage(message, event.message_id);
    return true;
  }

  private isPrivileged(event: TwitchChatMessageEvent): boolean {
    if (event.chatter_user_id === event.broadcaster_user_id) {
      return true;
    }
    return (event.badges ?? []).some(
      (badge) =>
        badge.set_id === "moderator" || badge.set_id === "broadcaster",
    );
  }

  private render(template: string, values: Record<string, unknown>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];
      return value === undefined || value === null ? match : String(value);
    });
  }
}
