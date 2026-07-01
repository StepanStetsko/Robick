import type { TwitchChatMessageEvent } from "../twitch.types.js";
import type { TwitchChatService } from "../TwitchChatService.js";

export type ParsedChatCommand = {
  name: string;
  args: string[];
  rawText: string;
};

export type ChatCommandContext = {
  event: TwitchChatMessageEvent;
  command: ParsedChatCommand;
  chatService: TwitchChatService;
};

export type ChatCommandDefinition = {
  name: string;
  description: string;
  cooldownMs?: number;
  execute: (context: ChatCommandContext) => Promise<void>;
};