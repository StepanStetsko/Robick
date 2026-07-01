import { logger } from "../../../core/logger/logger.js";
import type { ParsedChatCommand } from "./chat-command.types.js";

export class ChatCommandParser {
  constructor(private readonly prefix = "!") {}

  parse(messageText: string): ParsedChatCommand | null {
    const trimmed = messageText.trim();

    if (!trimmed.startsWith(this.prefix)) {
      logger.info("Chat command parser: not a command", { messageText });
      return null;
    }

    const withoutPrefix = trimmed.slice(this.prefix.length).trim();

    if (!withoutPrefix) {
      logger.info("Chat command parser: empty command after prefix", { messageText });
      return null;
    }

    const parts = withoutPrefix.split(/\s+/);
    const [rawName, ...args] = parts;

    if (!rawName) {
      logger.info("Chat command parser: missing command name", { messageText });
      return null;
    }

    const parsed = {
      name: rawName.toLowerCase(),
      args,
      rawText: trimmed,
    };

    logger.info("Chat command parser: parsed command", parsed);

    return parsed;
  }
}