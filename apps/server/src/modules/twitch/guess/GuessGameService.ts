import { logger } from "../../../core/logger/logger.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import { EconomyService } from "../economy/EconomyService.js";
import { GuessGameRepository } from "./GuessGameRepository.js";
import {
  defaultGuessGameMessages,
  normalizeCommandName,
  normalizeGuessGameMessages,
  type GuessGameMessages,
  type GuessGameSettingsDto,
  type GuessGameViewerInput,
  type UpdateGuessGameSettingsInput,
} from "./guess.types.js";
import type { GuessGameSettings } from "../../../generated/prisma/client.js";

type ActiveGame = {
  min: number;
  max: number;
  secret: number;
  reward: number;
  timer: NodeJS.Timeout | null;
};

/**
 * "Вгадай число" minigame. A mod/streamer starts a round with `!цифри <min>
 * <max> [seconds]`; the bot picks a secret number in the range. Viewers post
 * bare numbers in chat; the first to match the secret wins a fixed reward. The
 * round ends on a correct guess, on the optional timer, or on a manual stop.
 */
export class GuessGameService {
  private active: ActiveGame | null = null;

  constructor(
    private readonly repository: GuessGameRepository,
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
  ) {}

  async getSettings(): Promise<GuessGameSettingsDto> {
    const row = await this.repository.getSettingsRow();
    return this.toSettingsDto(row);
  }

  async updateSettings(
    input: UpdateGuessGameSettingsInput,
  ): Promise<GuessGameSettingsDto> {
    const normalized: UpdateGuessGameSettingsInput = { ...input };

    if (input.command !== undefined) {
      normalized.command = normalizeCommandName(input.command, "цифри");
    }

    if (input.stopCommand !== undefined) {
      normalized.stopCommand = normalizeCommandName(
        input.stopCommand,
        "стопцифри",
      );
    }

    if (input.reward !== undefined) {
      normalized.reward = this.clampInt(input.reward, 1, 1_000_000_000);
    }

    if (input.maxRange !== undefined) {
      normalized.maxRange = this.clampInt(input.maxRange, 1, 1_000_000_000);
    }

    if (input.maxDurationSeconds !== undefined) {
      normalized.maxDurationSeconds = this.clampInt(
        input.maxDurationSeconds,
        1,
        86_400,
      );
    }

    if (input.messages !== undefined) {
      normalized.messages = normalizeGuessGameMessages(input.messages);
    }

    const row = await this.repository.updateSettings(normalized);
    return this.toSettingsDto(row);
  }

  isRunning(): boolean {
    return this.active !== null;
  }

  async requestStart(
    starter: GuessGameViewerInput,
    args: string[],
    replyMessageId: string,
    privileged: boolean,
  ): Promise<void> {
    const settings = await this.getSettings();
    const messages = settings.messages;
    const displayName = starter.displayName?.trim() || starter.userLogin;

    if (!privileged) {
      await this.chatService.sendMessage(
        this.render(messages.notAllowed, { displayName }),
        replyMessageId,
      );
      return;
    }

    if (this.active) {
      await this.chatService.sendMessage(
        this.render(messages.alreadyRunning, { displayName }),
        replyMessageId,
      );
      return;
    }

    const rawMin = Number.parseInt(args[0] ?? "", 10);
    const rawMax = Number.parseInt(args[1] ?? "", 10);

    if (
      !Number.isFinite(rawMin) ||
      !Number.isFinite(rawMax) ||
      String(rawMin) !== (args[0] ?? "").trim() ||
      String(rawMax) !== (args[1] ?? "").trim()
    ) {
      await this.chatService.sendMessage(
        this.render(messages.invalidRange, {
          displayName,
          command: settings.command,
        }),
        replyMessageId,
      );
      return;
    }

    const min = Math.min(rawMin, rawMax);
    const max = Math.max(rawMin, rawMax);

    if (max - min < 1) {
      await this.chatService.sendMessage(
        this.render(messages.invalidRange, {
          displayName,
          command: settings.command,
        }),
        replyMessageId,
      );
      return;
    }

    if (max - min > settings.maxRange) {
      await this.chatService.sendMessage(
        this.render(messages.rangeTooBig, {
          displayName,
          maxRange: settings.maxRange,
        }),
        replyMessageId,
      );
      return;
    }

    const seconds = this.parseDuration(args[2], settings.maxDurationSeconds);
    const secret = min + Math.floor(Math.random() * (max - min + 1));
    const unit = await this.getUnit();

    this.active = {
      min,
      max,
      secret,
      reward: settings.reward,
      timer: null,
    };

    await this.chatService.sendMessage(
      this.render(seconds ? messages.startTimed : messages.start, {
        min,
        max,
        reward: settings.reward,
        unit,
        seconds: seconds ?? 0,
      }),
    );

    twitchEventLog.add({
      source: "chat",
      type: "guess.started",
      message: `Guess game started by ${starter.userLogin}: ${min}-${max}`,
      data: { min, max, reward: settings.reward, seconds: seconds ?? null },
    });

    if (seconds) {
      this.active.timer = setTimeout(() => {
        void this.timeout();
      }, seconds * 1000);
    }
  }

  /**
   * Process a viewer's numeric guess. Returns true when this guess won the
   * round (so the caller can stop further routing).
   */
  async submitGuess(
    viewer: GuessGameViewerInput,
    value: number,
  ): Promise<boolean> {
    if (!this.active || value !== this.active.secret) {
      return false;
    }

    // Capture + clear synchronously so a near-simultaneous second correct
    // guess sees no active game and can't double-award.
    const game = this.active;
    this.active = null;
    this.clearTimer(game);

    const settings = await this.getSettings();
    const unit = await this.getUnit();
    const displayName = viewer.displayName?.trim() || viewer.userLogin;

    let balance = 0;

    try {
      const wallet = await this.economyService.award(
        {
          twitchUserId: viewer.twitchUserId,
          userLogin: viewer.userLogin,
          displayName,
        },
        game.reward,
        "guess",
      );
      balance = wallet.balance;
    } catch (error) {
      logger.error("Guess game award failed", {
        userId: viewer.twitchUserId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.chatService.sendMessage(
      this.render(settings.messages.win, {
        displayName,
        secret: game.secret,
        reward: game.reward,
        unit,
        balance,
      }),
    );

    twitchEventLog.add({
      source: "chat",
      type: "guess.won",
      message: `Guess game won by ${viewer.userLogin}: ${game.secret}`,
      data: { secret: game.secret, reward: game.reward },
    });

    return true;
  }

  async stopByCommand(
    viewer: GuessGameViewerInput,
    replyMessageId: string,
    privileged: boolean,
  ): Promise<void> {
    const settings = await this.getSettings();
    const displayName = viewer.displayName?.trim() || viewer.userLogin;

    if (!privileged) {
      await this.chatService.sendMessage(
        this.render(settings.messages.notAllowed, { displayName }),
        replyMessageId,
      );
      return;
    }

    if (!this.active) {
      await this.chatService.sendMessage(
        this.render(settings.messages.noActiveGame, { displayName }),
        replyMessageId,
      );
      return;
    }

    const game = this.active;
    this.active = null;
    this.clearTimer(game);

    await this.chatService.sendMessage(
      this.render(settings.messages.stopped, { secret: game.secret }),
    );
  }

  /** Silent stop used on runtime shutdown — clears the timer, no chat output. */
  stop(): void {
    if (this.active) {
      this.clearTimer(this.active);
      this.active = null;
    }
  }

  private async timeout(): Promise<void> {
    if (!this.active) {
      return;
    }

    const game = this.active;
    this.active = null;
    this.clearTimer(game);

    const settings = await this.getSettings();

    await this.chatService.sendMessage(
      this.render(settings.messages.timeout, { secret: game.secret }),
    );

    twitchEventLog.add({
      source: "chat",
      type: "guess.timeout",
      message: `Guess game timed out: ${game.secret}`,
      data: { secret: game.secret },
    });
  }

  private parseDuration(
    raw: string | undefined,
    maxSeconds: number,
  ): number | null {
    if (raw === undefined) {
      return null;
    }

    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return null;
    }

    return Math.min(parsed, maxSeconds);
  }

  private clearTimer(game: ActiveGame): void {
    if (game.timer) {
      clearTimeout(game.timer);
      game.timer = null;
    }
  }

  private async getUnit(): Promise<string> {
    const economySettings = await this.economyService.getSettings();
    return economySettings.unit;
  }

  private clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private toSettingsDto(row: GuessGameSettings): GuessGameSettingsDto {
    return {
      command: row.command,
      stopCommand: row.stopCommand,
      reward: row.reward,
      maxRange: row.maxRange,
      maxDurationSeconds: row.maxDurationSeconds,
      messages: normalizeGuessGameMessages(row.messages),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private render(
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

export { defaultGuessGameMessages };
export type { GuessGameMessages };
