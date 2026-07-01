import { logger } from "../../../core/logger/logger.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import { EconomyService } from "../economy/EconomyService.js";
import { GiveawayRepository } from "./GiveawayRepository.js";
import {
  normalizeGiveawayMessages,
  normalizeGiveawayPresets,
  type GiveawayMessages,
  type GiveawayPreset,
  type GiveawaySettingsDto,
  type GiveawayViewerInput,
  type UpdateGiveawaySettingsInput,
} from "./giveaway.types.js";
import type { GiveawaySettings } from "../../../generated/prisma/client.js";

type Participant = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
};

type ActiveGiveaway = {
  amount: number;
  preset: GiveawayPreset;
  participants: Map<string, Participant>;
  endsAt: number;
  timers: NodeJS.Timeout[];
  selfFunded: boolean;
  funder: Participant | null;
};

export class GiveawayService {
  private active: ActiveGiveaway | null = null;

  constructor(
    private readonly repository: GiveawayRepository,
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
  ) {}

  async getSettings(): Promise<GiveawaySettingsDto> {
    const row = await this.repository.getSettingsRow();
    return this.toSettingsDto(row);
  }

  async updateSettings(
    input: UpdateGiveawaySettingsInput,
  ): Promise<GiveawaySettingsDto> {
    const normalized: UpdateGiveawaySettingsInput = { ...input };

    if (input.presets !== undefined) {
      normalized.presets = normalizeGiveawayPresets(input.presets);
    }

    if (input.messages !== undefined) {
      normalized.messages = normalizeGiveawayMessages(input.messages);
    }

    if (input.joinKeyword !== undefined) {
      normalized.joinKeyword = input.joinKeyword
        .trim()
        .replace(/^!+/, "")
        .toLocaleLowerCase();
    }

    if (input.selfCommand !== undefined) {
      normalized.selfCommand = input.selfCommand
        .trim()
        .replace(/^!+/, "")
        .toLocaleLowerCase();
    }

    if (input.maxAmount !== undefined) {
      normalized.maxAmount = this.clampInt(input.maxAmount, 1, 1_000_000_000);
    }

    if (input.durationSeconds !== undefined) {
      normalized.durationSeconds = this.clampInt(input.durationSeconds, 5, 3600);
    }

    if (input.reminderMinSeconds !== undefined) {
      normalized.reminderMinSeconds = this.clampInt(
        input.reminderMinSeconds,
        1,
        3600,
      );
    }

    if (input.reminderMaxSeconds !== undefined) {
      normalized.reminderMaxSeconds = this.clampInt(
        input.reminderMaxSeconds,
        1,
        3600,
      );
    }

    const row = await this.repository.updateSettings(normalized);
    return this.toSettingsDto(row);
  }

  isRunning(): boolean {
    return this.active !== null;
  }

  join(viewer: GiveawayViewerInput): void {
    if (!this.active) {
      return;
    }

    this.active.participants.set(viewer.twitchUserId, {
      twitchUserId: viewer.twitchUserId,
      userLogin: viewer.userLogin,
      displayName: viewer.displayName?.trim() || viewer.userLogin,
    });
  }

  async requestStart(
    starter: GiveawayViewerInput,
    preset: GiveawayPreset,
    amountArg: string | undefined,
    replyMessageId: string,
    privileged: boolean,
  ): Promise<void> {
    const settings = await this.getSettings();
    const messages = settings.messages;
    const unit = await this.getUnit();

    if (!privileged) {
      await this.chatService.sendMessage(
        this.render(messages.notAllowed, {
          displayName: starter.displayName?.trim() || starter.userLogin,
        }),
        replyMessageId,
      );
      return;
    }

    if (this.active) {
      await this.chatService.sendMessage(
        this.render(messages.alreadyRunning, {
          displayName: starter.displayName?.trim() || starter.userLogin,
        }),
        replyMessageId,
      );
      return;
    }

    const parsedAmount = amountArg ? Number.parseInt(amountArg, 10) : NaN;

    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      await this.chatService.sendMessage(
        this.render(messages.invalidAmount, {
          displayName: starter.displayName?.trim() || starter.userLogin,
          commandName: preset.commandName,
        }),
        replyMessageId,
      );
      return;
    }

    const amount = Math.min(parsedAmount, settings.maxAmount);

    this.active = {
      amount,
      preset,
      participants: new Map(),
      endsAt: Date.now() + settings.durationSeconds * 1000,
      timers: [],
      selfFunded: false,
      funder: null,
    };

    await this.chatService.sendMessage(
      this.render(messages.start, {
        amount,
        unit,
        joinKeyword: settings.joinKeyword,
        seconds: settings.durationSeconds,
      }),
    );

    twitchEventLog.add({
      source: "chat",
      type: "giveaway.started",
      message: `Giveaway started by ${starter.userLogin}: ${amount}`,
      data: {
        amount,
        commandName: preset.commandName,
        durationSeconds: settings.durationSeconds,
      },
    });

    this.scheduleReminders(settings, unit);

    const finishTimer = setTimeout(() => {
      void this.finish(unit);
    }, settings.durationSeconds * 1000);

    this.active.timers.push(finishTimer);
  }

  /**
   * Start a giveaway funded from the organizer's OWN balance (no minting). The
   * amount is deducted up front and paid out to winners on finish; if nobody
   * joins it is refunded. Available to anyone (it's their own points).
   */
  async requestStartSelf(
    starter: GiveawayViewerInput,
    amountArg: string | undefined,
    replyMessageId: string,
  ): Promise<void> {
    const settings = await this.getSettings();
    const messages = settings.messages;
    const unit = await this.getUnit();
    const displayName = starter.displayName?.trim() || starter.userLogin;

    if (this.active) {
      await this.chatService.sendMessage(
        this.render(messages.alreadyRunning, { displayName }),
        replyMessageId,
      );
      return;
    }

    const parsedAmount = amountArg ? Number.parseInt(amountArg, 10) : NaN;

    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      await this.chatService.sendMessage(
        this.render(messages.invalidAmount, {
          displayName,
          commandName: settings.selfCommand,
        }),
        replyMessageId,
      );
      return;
    }

    const amount = Math.min(parsedAmount, settings.maxAmount);

    // Deduct the organizer's own points up front (held as the prize pool).
    try {
      await this.economyService.spend(starter.twitchUserId, amount);
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        const balance = await this.economyService.getBalance(starter.twitchUserId);
        await this.chatService.sendMessage(
          this.render(messages.selfInsufficient, {
            displayName,
            amount,
            balance,
            unit,
          }),
          replyMessageId,
        );
        return;
      }
      throw error;
    }

    const funder: Participant = {
      twitchUserId: starter.twitchUserId,
      userLogin: starter.userLogin,
      displayName,
    };

    const preset: GiveawayPreset = {
      commandName: settings.selfCommand,
      winnersMode: "dynamic",
      fixedWinners: 1,
      minWinners: 1,
      maxWinners: 10,
      participantsForMax: 100,
      enabled: true,
    };

    this.active = {
      amount,
      preset,
      participants: new Map(),
      endsAt: Date.now() + settings.durationSeconds * 1000,
      timers: [],
      selfFunded: true,
      funder,
    };

    await this.chatService.sendMessage(
      this.render(messages.selfStart, {
        displayName,
        amount,
        unit,
        joinKeyword: settings.joinKeyword,
        seconds: settings.durationSeconds,
      }),
    );

    twitchEventLog.add({
      source: "chat",
      type: "giveaway.self_started",
      message: `Self giveaway by ${starter.userLogin}: ${amount}`,
      data: { amount, funder: starter.userLogin },
    });

    this.scheduleReminders(settings, unit);

    const finishTimer = setTimeout(() => {
      void this.finish(unit);
    }, settings.durationSeconds * 1000);

    this.active.timers.push(finishTimer);
  }

  stop(): void {
    if (this.active) {
      this.clearTimers();
      this.active = null;
    }
  }

  private scheduleReminders(settings: GiveawaySettingsDto, unit: string): void {
    const scheduleOne = () => {
      if (!this.active) {
        return;
      }

      const delayMs =
        this.randomBetween(
          settings.reminderMinSeconds,
          settings.reminderMaxSeconds,
        ) * 1000;
      const remainingMs = this.active.endsAt - Date.now();

      // Не плануємо нагадування, якщо до завершення менше за інтервал.
      if (remainingMs <= delayMs + 1000) {
        return;
      }

      const timer = setTimeout(() => {
        if (!this.active) {
          return;
        }

        const secondsLeft = Math.max(
          0,
          Math.round((this.active.endsAt - Date.now()) / 1000),
        );

        void this.chatService.sendMessage(
          this.render(settings.messages.reminder, {
            amount: this.active.amount,
            unit,
            secondsLeft,
            participantsCount: this.active.participants.size,
            joinKeyword: settings.joinKeyword,
          }),
        );

        scheduleOne();
      }, delayMs);

      this.active.timers.push(timer);
    };

    scheduleOne();
  }

  private async finish(unit: string): Promise<void> {
    if (!this.active) {
      return;
    }

    const giveaway = this.active;
    this.clearTimers();
    this.active = null;

    const settings = await this.getSettings();
    const participants = [...giveaway.participants.values()];

    if (participants.length === 0) {
      // Self-funded: refund the organizer their held pool.
      if (giveaway.selfFunded && giveaway.funder) {
        try {
          await this.economyService.award(
            {
              twitchUserId: giveaway.funder.twitchUserId,
              userLogin: giveaway.funder.userLogin,
              displayName: giveaway.funder.displayName,
            },
            giveaway.amount,
            "giveaway",
          );
        } catch (error) {
          logger.error("Self giveaway refund failed", {
            userId: giveaway.funder.twitchUserId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        await this.chatService.sendMessage(
          this.render(settings.messages.selfRefunded, {
            displayName: giveaway.funder.displayName,
            amount: giveaway.amount,
            unit,
          }),
        );
        return;
      }

      await this.chatService.sendMessage(
        this.render(settings.messages.noParticipants, {}),
      );
      return;
    }

    const winnerCount = this.resolveWinnerCount(
      giveaway.preset,
      participants.length,
    );
    const winners = this.shuffle(participants).slice(0, winnerCount);
    const perWinner = Math.floor(giveaway.amount / winners.length);
    let remainder = giveaway.amount - perWinner * winners.length;

    for (const winner of winners) {
      const share = perWinner + (remainder > 0 ? 1 : 0);

      if (remainder > 0) {
        remainder -= 1;
      }

      if (share <= 0) {
        continue;
      }

      try {
        await this.economyService.award(
          {
            twitchUserId: winner.twitchUserId,
            userLogin: winner.userLogin,
            displayName: winner.displayName,
          },
          share,
          "giveaway",
        );
      } catch (error) {
        logger.error("Giveaway award failed", {
          userId: winner.twitchUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.chatService.sendMessage(
      this.render(settings.messages.winners, {
        amount: giveaway.amount,
        unit,
        winners: winners.map((winner) => winner.displayName).join(", "),
        perWinner,
        winnersCount: winners.length,
        participantsCount: participants.length,
      }),
    );

    twitchEventLog.add({
      source: "chat",
      type: "giveaway.finished",
      message: `Giveaway finished: ${winners.length} winner(s)`,
      data: {
        amount: giveaway.amount,
        winners: winners.map((winner) => winner.userLogin),
        participants: participants.length,
        perWinner,
      },
    });
  }

  private resolveWinnerCount(
    preset: GiveawayPreset,
    participantCount: number,
  ): number {
    if (preset.winnersMode === "fixed") {
      return Math.min(Math.max(1, preset.fixedWinners), participantCount);
    }

    const raw = Math.round(
      preset.maxWinners *
        Math.sqrt(participantCount / Math.max(1, preset.participantsForMax)),
    );
    const clamped = Math.max(
      preset.minWinners,
      Math.min(preset.maxWinners, raw),
    );

    return Math.min(clamped, participantCount);
  }

  private clearTimers(): void {
    if (!this.active) {
      return;
    }

    for (const timer of this.active.timers) {
      clearTimeout(timer);
    }

    this.active.timers = [];
  }

  private async getUnit(): Promise<string> {
    const economySettings = await this.economyService.getSettings();
    return economySettings.unit;
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }

    return copy;
  }

  private randomBetween(min: number, max: number): number {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + Math.random() * (high - low);
  }

  private clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private toSettingsDto(row: GiveawaySettings): GiveawaySettingsDto {
    return {
      joinKeyword: row.joinKeyword,
      selfCommand: row.selfCommand,
      maxAmount: row.maxAmount,
      durationSeconds: row.durationSeconds,
      reminderMinSeconds: row.reminderMinSeconds,
      reminderMaxSeconds: row.reminderMaxSeconds,
      presets: normalizeGiveawayPresets(row.presets),
      messages: normalizeGiveawayMessages(row.messages),
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

export type { GiveawayMessages };
