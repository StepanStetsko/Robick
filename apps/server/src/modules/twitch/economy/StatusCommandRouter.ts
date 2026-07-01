import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { BuffService } from "../buffs/BuffService.js";
import { EconomyService } from "./EconomyService.js";
import { ProtectionRepository } from "../steal/ProtectionRepository.js";

const COMMAND_PREFIX = "!";

/**
 * Handles the status command (e.g. !профіль) — shows the viewer's balance
 * together with their active buffs and debuffs. The lurker debuff is virtual
 * and never active here (typing the command marks the viewer as active), so
 * only stored ActiveBuffs are shown.
 */
export class StatusCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
    private readonly buffService: BuffService,
    private readonly protectionRepository: ProtectionRepository,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const commandName = this.parseCommandName(event.message.text);

    if (!commandName) {
      return false;
    }

    const settings = await this.economyService.getSettings();

    if (commandName !== settings.statusCommand) {
      return false;
    }

    const twitchUserId = event.chatter_user_id;
    const displayName = event.chatter_user_name || event.chatter_user_login;

    const now = new Date();
    const [balance, activeBuffs, protection] = await Promise.all([
      this.economyService.getBalance(twitchUserId),
      this.buffService.getActiveBuffs(twitchUserId),
      this.protectionRepository.getActive(twitchUserId, now),
    ]);

    const shield = protection
      ? `🛡️ ${Math.max(
          1,
          Math.ceil((protection.expiresAt.getTime() - now.getTime()) / 60_000),
        )} хв`
      : settings.messages.statusNone;

    const buffs = activeBuffs
      .filter((buff) => buff.kind === "buff")
      .map((buff) => buff.title);
    const debuffs = activeBuffs
      .filter((buff) => buff.kind === "debuff")
      .map((buff) => buff.title);

    const message = this.renderTemplate(settings.messages.statusMessage, {
      displayName,
      balance,
      unit: settings.unit,
      buffs: buffs.length > 0 ? buffs.join(", ") : settings.messages.statusNone,
      debuffs:
        debuffs.length > 0 ? debuffs.join(", ") : settings.messages.statusNone,
      shield,
    });

    await this.chatService.sendMessage(message, event.message_id);
    return true;
  }

  private parseCommandName(messageText: string): string | null {
    const trimmed = messageText.trim();

    if (!trimmed.startsWith(COMMAND_PREFIX)) {
      return null;
    }

    const withoutPrefix = trimmed.slice(COMMAND_PREFIX.length).trim();
    const [rawCommandName] = withoutPrefix.split(/\s+/);
    const commandName = rawCommandName?.toLocaleLowerCase();

    return commandName || null;
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
