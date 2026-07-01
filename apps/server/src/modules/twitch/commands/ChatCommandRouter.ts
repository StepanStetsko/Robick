import { logger } from "../../../core/logger/logger.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { ChatCommandActionDispatcher } from "./ChatCommandActionDispatcher.js";
import { ChatCommandParser } from "./ChatCommandParser.js";
import { commandUsageHistory, type CommandActionDispatchStatus } from "./CommandUsageHistory.js";
import { CustomChatCommandService } from "./custom/CustomChatCommandService.js";

export class ChatCommandRouter {
  private readonly parser = new ChatCommandParser("!");
  private readonly rateLimitService = new RateLimitService();

  constructor(
    private readonly chatService: TwitchChatService,
    private readonly customCommandService: CustomChatCommandService,
    private readonly actionDispatcher: ChatCommandActionDispatcher,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    logger.info("ChatCommandRouter.handle called", {
      text: event.message.text,
      userLogin: event.chatter_user_login,
    });

    const parsedCommand = this.parser.parse(event.message.text);

    if (!parsedCommand) {
      return false;
    }

    const command = this.customCommandService.getByName(parsedCommand.name);

    if (!command || !command.enabled) {
      logger.info("Custom chat command not found or disabled", {
        commandName: parsedCommand.name,
        enabled: command?.enabled ?? false,
      });

      commandUsageHistory.add({
        commandName: parsedCommand.name,
        userId: event.chatter_user_id,
        userLogin: event.chatter_user_login,
        userName: event.chatter_user_name,
        responseText: command?.responseText ?? "",
        replyMode: command?.replyMode ?? "reply",
        status: "disabled_or_missing",
        messageId: event.message_id,
        actionEnabled: command?.actionEnabled ?? false,
        targetTransports: command?.targetTransports ?? [],
        unityEventName: command?.unityEventName ?? null,
        unrealEventName: command?.unrealEventName ?? null,
        actionDispatchStatus: "skipped",
      });

      return true;
    }

    const cooldownResult = this.rateLimitService.isAllowed(
      `command:${command.name}:user:${event.chatter_user_id}`,
      command.cooldownMs,
    );

    if (!cooldownResult.allowed) {
      logger.warn("Command skipped by cooldown", {
        userId: event.chatter_user_id,
        userLogin: event.chatter_user_login,
        commandName: command.name,
        retryAfterMs: cooldownResult.retryAfterMs,
      });

      commandUsageHistory.add({
        commandName: command.name,
        userId: event.chatter_user_id,
        userLogin: event.chatter_user_login,
        userName: event.chatter_user_name,
        responseText: command.responseText,
        replyMode: command.replyMode,
        status: "cooldown",
        messageId: event.message_id,
        actionEnabled: command.actionEnabled ?? false,
        targetTransports: command.targetTransports ?? [],
        unityEventName: command.unityEventName ?? null,
        unrealEventName: command.unrealEventName ?? null,
        actionDispatchStatus: "skipped",
      });

      twitchEventLog.add({
        level: "warn",
        source: "chat",
        type: "command.cooldown",
        message: `Command !${command.name} skipped by cooldown`,
        data: {
          commandName: command.name,
          userId: event.chatter_user_id,
          userLogin: event.chatter_user_login,
          retryAfterMs: cooldownResult.retryAfterMs,
        },
      });

      return true;
    }

    const responseText = command.responseText
      .replaceAll("{user}", event.chatter_user_login)
      .replaceAll("{displayName}", event.chatter_user_name ?? event.chatter_user_login)
      .replaceAll("{command}", command.name);

    let replyFailed = false;
    let actionDispatchStatus: CommandActionDispatchStatus = "skipped";

    try {
      if (responseText) {
        if (command.replyMode === "reply") {
          await this.chatService.sendMessage(responseText, event.message_id);
        } else {
          await this.chatService.sendMessage(responseText);
        }
      }

      logger.info("Custom chat command reply executed", {
        userId: event.chatter_user_id,
        userLogin: event.chatter_user_login,
        commandName: command.name,
      });
    } catch (error) {
      replyFailed = true;

      logger.error("Failed to send custom chat command reply", {
        userId: event.chatter_user_id,
        userLogin: event.chatter_user_login,
        commandName: command.name,
        error,
      });

      twitchEventLog.add({
        level: "error",
        source: "chat",
        type: "command.execution_failed",
        message: `Failed to execute custom command reply: !${command.name}`,
        data: {
          commandName: command.name,
          userId: event.chatter_user_id,
          userLogin: event.chatter_user_login,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    const actionResult = await this.actionDispatcher.dispatch(command, parsedCommand, event);
    actionDispatchStatus = actionResult.status;

    commandUsageHistory.add({
      commandName: command.name,
      userId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      userName: event.chatter_user_name,
      responseText,
      replyMode: command.replyMode,
      status: replyFailed ? "failed" : "executed",
      messageId: event.message_id,
      actionEnabled: command.actionEnabled ?? false,
      targetTransports: command.targetTransports ?? [],
      unityEventName: command.unityEventName ?? null,
      unrealEventName: command.unrealEventName ?? null,
      actionDispatchStatus,
    });

    if (!replyFailed) {
      twitchEventLog.add({
        source: "chat",
        type: "command.executed",
        message: `Custom command executed: !${command.name}`,
        data: {
          commandName: command.name,
          userId: event.chatter_user_id,
          userLogin: event.chatter_user_login,
          userName: event.chatter_user_name,
          replyMode: command.replyMode,
          actionEnabled: command.actionEnabled ?? false,
          targetTransports: command.targetTransports ?? [],
          actionDispatchStatus,
        },
      });
    }

    return true;
  }
}
