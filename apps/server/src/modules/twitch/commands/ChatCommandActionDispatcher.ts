import crypto from "node:crypto";
import { logger } from "../../../core/logger/logger.js";
import type { UnityWebSocketServer } from "../../unity/UnityWebSocketServer.js";
import type { UnityChatCommandDispatchMessage } from "../../unity/unity-dispatch.types.js";
import type { UnrealWebSocketServer } from "../../unreal/UnrealWebSocketServer.js";
import type { UnrealChatCommandDispatchMessage } from "../../unreal/unreal-dispatch.types.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import type { ParsedChatCommand } from "./chat-command.types.js";
import type { CustomChatCommand } from "./custom/custom-chat-command.types.js";
import type { CommandActionDispatchStatus } from "./CommandUsageHistory.js";

type CommandActionDispatchResult = {
  status: CommandActionDispatchStatus;
  dispatchedTargets: string[];
};

type TemplateVariables = Record<string, string>;

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function substituteString(input: string, variables: TemplateVariables): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, token) => {
    return token in variables ? variables[token] ?? "" : match;
  });
}

function resolveTemplateValue(value: unknown, variables: TemplateVariables): unknown {
  if (typeof value === "string") {
    return substituteString(value, variables);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateValue(entry, variables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveTemplateValue(entry, variables),
      ]),
    );
  }

  return value;
}

function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}

export class ChatCommandActionDispatcher {
  constructor(
    private readonly unrealWebSocketServer: UnrealWebSocketServer,
    private readonly unityWebSocketServer: UnityWebSocketServer,
  ) {}

  async dispatch(
    command: CustomChatCommand,
    parsedCommand: ParsedChatCommand,
    event: TwitchChatMessageEvent,
  ): Promise<CommandActionDispatchResult> {
    const targetTransports = command.targetTransports ?? [];

    if (!command.actionEnabled || targetTransports.length === 0) {
      twitchEventLog.add({
        source: "chat",
        type: "command.action_dispatch_skipped",
        message: `Command action dispatch skipped: !${command.name}`,
        data: {
          commandName: command.name,
          messageId: event.message_id,
          reason: command.actionEnabled ? "no_targets" : "action_disabled",
        },
      });

      return {
        status: "skipped",
        dispatchedTargets: [],
      };
    }

    twitchEventLog.add({
      source: "chat",
      type: "command.action_dispatch_started",
      message: `Command action dispatch started: !${command.name}`,
      data: {
        commandName: command.name,
        messageId: event.message_id,
        targetTransports,
        unityEventName: command.unityEventName ?? null,
        unrealEventName: command.unrealEventName ?? null,
      },
    });

    const timestamp = new Date().toISOString();
    const dispatchedTargets: string[] = [];

    try {
      if (targetTransports.includes("unreal")) {
        const eventName = command.unrealEventName;

        if (!eventName) {
          throw new Error("unrealEventName is required for Unreal command dispatch");
        }

        const message: UnrealChatCommandDispatchMessage = {
          type: "chat_command_dispatch",
          eventId: crypto.randomUUID(),
          messageId: event.message_id,
          commandName: command.name,
          eventName,
          args: parsedCommand.args,
          rawText: parsedCommand.rawText,
          user: {
            id: event.chatter_user_id,
            login: event.chatter_user_login,
            displayName: event.chatter_user_name,
          },
          payload: this.buildPayload(command, parsedCommand, event, eventName, timestamp),
          timestamp,
        };

        this.unrealWebSocketServer.broadcastChatCommandDispatch(message);
        dispatchedTargets.push("unreal");
      }

      if (targetTransports.includes("unity")) {
        const eventName = command.unityEventName;

        if (!eventName) {
          throw new Error("unityEventName is required for Unity command dispatch");
        }

        const message: UnityChatCommandDispatchMessage = {
          type: "chat_command_dispatch",
          transport: "unity",
          eventId: crypto.randomUUID(),
          messageId: event.message_id,
          commandName: command.name,
          eventName,
          args: parsedCommand.args,
          rawText: parsedCommand.rawText,
          user: {
            id: event.chatter_user_id,
            login: event.chatter_user_login,
            displayName: event.chatter_user_name,
          },
          payload: this.buildPayload(command, parsedCommand, event, eventName, timestamp),
          timestamp,
        };

        this.unityWebSocketServer.broadcastChatCommandDispatch(message);
        dispatchedTargets.push("unity");
      }

      twitchEventLog.add({
        source: "chat",
        type: "command.action_dispatch_succeeded",
        message: `Command action dispatch succeeded: !${command.name}`,
        data: {
          commandName: command.name,
          messageId: event.message_id,
          targetTransports,
          dispatchedTargets,
          unityEventName: command.unityEventName ?? null,
          unrealEventName: command.unrealEventName ?? null,
        },
      });

      return {
        status: dispatchedTargets.length > 0 ? "dispatched" : "skipped",
        dispatchedTargets,
      };
    } catch (error) {
      logger.error("Failed to dispatch custom command action", {
        commandName: command.name,
        messageId: event.message_id,
        targetTransports,
        error,
      });

      twitchEventLog.add({
        level: "error",
        source: "chat",
        type: "command.action_dispatch_failed",
        message: `Command action dispatch failed: !${command.name}`,
        data: {
          commandName: command.name,
          messageId: event.message_id,
          targetTransports,
          dispatchedTargets,
          unityEventName: command.unityEventName ?? null,
          unrealEventName: command.unrealEventName ?? null,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return {
        status: "failed",
        dispatchedTargets,
      };
    }
  }

  private buildPayload(
    command: CustomChatCommand,
    parsedCommand: ParsedChatCommand,
    event: TwitchChatMessageEvent,
    eventName: string,
    timestamp: string,
  ): Record<string, unknown> {
    const variables: TemplateVariables = {
      commandName: command.name,
      userId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      userName: event.chatter_user_name,
      messageId: event.message_id,
      rawText: parsedCommand.rawText,
      argsText: parsedCommand.args.join(" "),
      arg0: parsedCommand.args[0] ?? "",
      arg1: parsedCommand.args[1] ?? "",
      arg2: parsedCommand.args[2] ?? "",
      eventName,
      timestamp,
    };

    const templatePayload = deepClone(command.payloadTemplate ?? null);
    const resolvedTemplate = resolveTemplateValue(templatePayload, variables);
    const resolvedPayload = toPayloadRecord(resolvedTemplate);

    return {
      ...resolvedPayload,
      eventName,
      command: {
        name: command.name,
        args: parsedCommand.args,
        rawText: parsedCommand.rawText,
        messageId: event.message_id,
      },
      user: {
        id: event.chatter_user_id,
        login: event.chatter_user_login,
        name: event.chatter_user_name,
      },
    };
  }
}
