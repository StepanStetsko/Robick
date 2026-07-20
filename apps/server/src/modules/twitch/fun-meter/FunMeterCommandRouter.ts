import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { BuffService } from "../buffs/BuffService.js";
import { FunMeterService } from "./FunMeterService.js";
import type { FunMeterViewerInput } from "./fun-meter.types.js";

const COMMAND_PREFIX = "!";

type ParsedFunMeterCommand = {
  commandName: string;
  args: string[];
};

export class FunMeterCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly service: FunMeterService,
    private readonly buffService: BuffService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const feature = await this.service.findEnabledFeatureByCommandName(
      parsed.commandName,
    );

    if (!feature) {
      return false;
    }

    const viewer = this.getViewer(event);
    const subcommand = parsed.args[0]?.toLocaleLowerCase();

    logger.info("Fun meter command received", {
      commandName: parsed.commandName,
      featureKey: feature.key,
      args: parsed.args,
      userLogin: viewer.userLogin,
    });

    if (!subcommand) {
      const limitStatus = await this.service.getRollLimitStatus(feature, viewer);

      if (!limitStatus.allowed) {
        await this.chatService.sendMessage(limitStatus.chatMessage, event.message_id);
        return true;
      }

      const modifiers = await this.buffService.resolveRollModifiers(
        viewer.twitchUserId,
      );

      const result = await this.service.rollFeature(feature, viewer, {
        source: "chat.command",
        modifiers,
      });

      await this.buffService.consumeRollBuffs(viewer.twitchUserId);

      await this.chatService.sendMessage(result.chatMessage, event.message_id);
      return true;
    }

    if (this.hasSubcommand(feature.leaderboardArgs, subcommand)) {
      const result = await this.service.getLeaderboardForCommand(feature, viewer);

      await this.chatService.sendMessage(result.chatMessage, event.message_id);
      return true;
    }

    if (this.hasSubcommand(feature.selfArgs, subcommand)) {
      const result = await this.service.getSelfScore(feature, viewer);

      await this.chatService.sendMessage(result.chatMessage, event.message_id);
      return true;
    }

    await this.chatService.sendMessage(
      this.service.formatUnknownSubcommandMessage(feature, viewer),
      event.message_id,
    );

    return true;
  }

  private parse(messageText: string): ParsedFunMeterCommand | null {
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
      args: rawArgs.map((arg) => arg.toLocaleLowerCase()),
    };
  }

  private hasSubcommand(allowedArgs: string[], subcommand: string): boolean {
    return allowedArgs
      .map((arg) => arg.toLocaleLowerCase())
      .includes(subcommand.toLocaleLowerCase());
  }

  private getViewer(event: TwitchChatMessageEvent): FunMeterViewerInput {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }
}
