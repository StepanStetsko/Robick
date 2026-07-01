import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { EconomyService } from "./EconomyService.js";
import { FunMeterService } from "../fun-meter/FunMeterService.js";
import { GiveawayService } from "../giveaway/GiveawayService.js";
import { GuessGameService } from "../guess/GuessGameService.js";

const COMMAND_PREFIX = "!";
// Stay well under Twitch's ~500-char message limit.
const MAX_MESSAGE_LENGTH = 480;

/**
 * Handles the help command (e.g. !команди) — lists the names of all enabled
 * commands across economy, fun-meter, giveaway and the guess game in a single
 * chat message. Names are read live from settings, so renaming any command in
 * the admin panel updates this list automatically.
 */
export class HelpCommandRouter {
  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
    private readonly funMeterService: FunMeterService,
    private readonly giveawayService: GiveawayService,
    private readonly guessGameService: GuessGameService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const commandName = this.parseCommandName(event.message.text);

    if (!commandName) {
      return false;
    }

    const economy = await this.economyService.getSettings();

    if (commandName !== economy.helpCommand) {
      return false;
    }

    const message = await this.renderMessage();
    await this.chatService.sendMessage(message, event.message_id);
    return true;
  }

  /**
   * The auto-generated command list — "!name (desc) · ..." — that {commands}
   * expands to. Command names come from settings (live, so renaming updates
   * the list); descriptions are built in. Buff/debuff commands are omitted.
   */
  async buildCommandList(): Promise<string> {
    const [economy, features, giveaway, guess] = await Promise.all([
      this.economyService.getSettings(),
      this.funMeterService.listFeatures(),
      this.giveawayService.getSettings(),
      this.guessGameService.getSettings(),
    ]);

    const entries: Array<[string, string]> = [
      [economy.balanceCommand, "баланс"],
      [economy.topCommand, "топ"],
      [economy.giveCommand, "передати"],
      [economy.statusCommand, "профіль"],
      [economy.rouletteCommand, "рулетка"],
      [economy.fightCommand, "бійка"],
      [guess.command, "вгадай число"],
      [guess.stopCommand, "стоп гри"],
      [economy.stealCommand, "крадіжка"],
      [economy.shieldCommand, "захист"],
      ...giveaway.presets
        .filter((preset) => preset.enabled)
        .map((preset): [string, string] => [preset.commandName, "розіграш"]),
      [giveaway.selfCommand, "розіграш своїх"],
      [giveaway.joinKeyword, "участь"],
      ...features
        .filter((feature) => feature.enabled)
        .map((feature): [string, string] => [
          feature.aliases[0] ?? feature.key,
          feature.title,
        ]),
      [economy.helpCommand, "цей список"],
    ];

    // Dedupe by command name (keep first), drop empties, render "!name (desc)".
    const seen = new Set<string>();
    const rendered: string[] = [];

    for (const [rawName, description] of entries) {
      const name = rawName?.trim();

      if (name && !seen.has(name)) {
        seen.add(name);
        rendered.push(`${COMMAND_PREFIX}${name} (${description})`);
      }
    }

    return rendered.join(" · ");
  }

  /** The full message that !команди would send (help template, {commands} expanded). */
  async renderMessage(): Promise<string> {
    const economy = await this.economyService.getSettings();
    const commands = await this.buildCommandList();

    return this.truncate(
      this.renderTemplate(economy.messages.help, { commands }),
    );
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

  private truncate(message: string): string {
    if (message.length <= MAX_MESSAGE_LENGTH) {
      return message;
    }

    return `${message.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd()}…`;
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
