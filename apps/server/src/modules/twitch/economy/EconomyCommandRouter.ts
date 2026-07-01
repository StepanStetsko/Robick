import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { EconomyService } from "./EconomyService.js";
import type { EconomyViewerInput } from "./economy.types.js";
import { LeaderLockService } from "../roulette/LeaderLockService.js";

const COMMAND_PREFIX = "!";
const DEFAULT_TOP_LIMIT = 5;
const AMOUNT_EXAMPLE = "100";

type ParsedCommand = {
  commandName: string;
  args: string[];
};

type MentionTarget = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
};

export class EconomyCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly service: EconomyService,
    private readonly leaderLock: LeaderLockService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const settings = await this.service.getSettings();
    const viewer = this.getViewer(event);

    if (parsed.commandName === settings.balanceCommand) {
      await this.handleBalance(event, viewer, settings);
      return true;
    }

    if (parsed.commandName === settings.topCommand) {
      await this.handleTop(event, settings);
      return true;
    }

    if (parsed.commandName === settings.giveCommand) {
      await this.handleGive(event, viewer, settings);
      return true;
    }

    return false;
  }

  private async handleBalance(
    event: TwitchChatMessageEvent,
    viewer: EconomyViewerInput,
    settings: Awaited<ReturnType<EconomyService["getSettings"]>>,
  ): Promise<void> {
    const balance = await this.service.getBalance(viewer.twitchUserId);
    const rank = await this.service.getRank(balance);

    const message = this.renderTemplate(settings.messages.balanceMessage, {
      displayName: this.getDisplayName(viewer),
      balance,
      unit: settings.unit,
      rank,
    });

    await this.chatService.sendMessage(message, event.message_id);
  }

  private async handleTop(
    event: TwitchChatMessageEvent,
    settings: Awaited<ReturnType<EconomyService["getSettings"]>>,
  ): Promise<void> {
    const leaderboard = await this.service.getLeaderboard(DEFAULT_TOP_LIMIT);

    if (leaderboard.length === 0) {
      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.topEmpty, {
          unit: settings.unit,
        }),
        event.message_id,
      );
      return;
    }

    const lines = leaderboard.map((entry) =>
      this.renderTemplate(settings.messages.topEntry, {
        rank: entry.rank,
        displayName: entry.displayName || entry.userLogin,
        login: entry.userLogin,
        balance: entry.balance,
        unit: settings.unit,
      }),
    );

    const message = [
      this.renderTemplate(settings.messages.topTitle, { unit: settings.unit }),
      ...lines,
    ].join("\n");

    await this.chatService.sendMessage(message, event.message_id);
  }

  private async handleGive(
    event: TwitchChatMessageEvent,
    viewer: EconomyViewerInput,
    settings: Awaited<ReturnType<EconomyService["getSettings"]>>,
  ): Promise<void> {
    const target = this.findMentionTarget(event);
    const amount = this.parseAmount(event.message.text);

    if (!target) {
      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.giveInvalidTarget, {
          displayName: this.getDisplayName(viewer),
          giveCommand: settings.giveCommand,
          amountExample: AMOUNT_EXAMPLE,
        }),
        event.message_id,
      );
      return;
    }

    if (amount === null) {
      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.giveInvalidAmount, {
          displayName: this.getDisplayName(viewer),
          giveCommand: settings.giveCommand,
          amountExample: AMOUNT_EXAMPLE,
        }),
        event.message_id,
      );
      return;
    }

    if (target.twitchUserId === viewer.twitchUserId) {
      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.giveSelf, {
          displayName: this.getDisplayName(viewer),
        }),
        event.message_id,
      );
      return;
    }

    // The locked leaderboard #1 can't offload points to dodge the all-in gate.
    if (
      settings.rouletteLeaderLockEnabled &&
      (await this.leaderLock.isLocked(viewer.twitchUserId))
    ) {
      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.rouletteLeaderTransferBlocked, {
          displayName: this.getDisplayName(viewer),
          rouletteCommand: settings.rouletteCommand,
        }),
        event.message_id,
      );
      return;
    }

    try {
      const result = await this.service.transfer(
        viewer,
        {
          twitchUserId: target.twitchUserId,
          userLogin: target.userLogin,
          displayName: target.displayName,
        },
        amount,
      );

      await this.chatService.sendMessage(
        this.renderTemplate(settings.messages.giveSuccess, {
          fromDisplayName: this.getDisplayName(viewer),
          toDisplayName: target.displayName,
          amount,
          unit: settings.unit,
          fromBalance: result.from.balance,
        }),
        event.message_id,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        const balance = await this.service.getBalance(viewer.twitchUserId);

        await this.chatService.sendMessage(
          this.renderTemplate(settings.messages.giveInsufficient, {
            displayName: this.getDisplayName(viewer),
            balance,
            unit: settings.unit,
          }),
          event.message_id,
        );
        return;
      }

      logger.error("Economy give command failed", {
        userLogin: viewer.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
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

  private findMentionTarget(
    event: TwitchChatMessageEvent,
  ): MentionTarget | null {
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

  private parseAmount(messageText: string): number | null {
    const tokens = messageText.trim().split(/\s+/).slice(1);

    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        const value = Number.parseInt(token, 10);

        if (Number.isFinite(value) && value >= 1) {
          return value;
        }
      }
    }

    return null;
  }

  private getViewer(event: TwitchChatMessageEvent): EconomyViewerInput {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }

  private getDisplayName(viewer: EconomyViewerInput): string {
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
