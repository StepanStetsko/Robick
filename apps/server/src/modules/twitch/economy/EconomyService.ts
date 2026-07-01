import { twitchEventLog } from "../events/twitch-event-log.js";
import { EconomyRepository } from "./EconomyRepository.js";
import { normalizeEconomyMessages } from "./economy.messages.js";
import {
  type EconomySettingsDto,
  type EconomyViewerInput,
  type UpdateEconomySettingsInput,
  type WalletDto,
  type WalletLeaderboardEntry,
} from "./economy.types.js";
import type {
  EconomySettings,
  ViewerWallet,
} from "../../../generated/prisma/client.js";

const DEFAULT_LEADERBOARD_LIMIT = 5;
const MAX_LIMIT = 100;
const MAX_AMOUNT = 1_000_000_000;
const SETTINGS_CACHE_TTL_MS = 30_000;
const HIGH_FREQUENCY_SOURCES = new Set(["chat.activity", "presence"]);

export type EconomyChangeSource =
  | "chat.activity"
  | "presence"
  | "command.give"
  | "giveaway"
  | "buff.purchase"
  | "roulette"
  | "guess"
  | "supporter.bonus"
  | "admin";

export class EconomyService {
  private settingsCache: { dto: EconomySettingsDto; at: number } | null = null;

  constructor(private readonly repository: EconomyRepository) {}

  async getSettings(force = false): Promise<EconomySettingsDto> {
    const now = Date.now();

    if (
      !force &&
      this.settingsCache &&
      now - this.settingsCache.at < SETTINGS_CACHE_TTL_MS
    ) {
      return this.settingsCache.dto;
    }

    const row = await this.repository.getSettingsRow();
    const dto = this.toSettingsDto(row);
    this.settingsCache = { dto, at: now };
    return dto;
  }

  async updateSettings(
    input: UpdateEconomySettingsInput,
  ): Promise<EconomySettingsDto> {
    const normalized = this.normalizeSettingsInput(input);
    const row = await this.repository.updateSettings(normalized);
    const dto = this.toSettingsDto(row);
    this.settingsCache = { dto, at: Date.now() };
    return dto;
  }

  async award(
    viewer: EconomyViewerInput,
    amount: number,
    source: EconomyChangeSource,
  ): Promise<WalletDto> {
    const normalizedAmount = this.normalizeAmount(amount);
    const wallet = await this.repository.creditWallet(viewer, normalizedAmount);

    if (!HIGH_FREQUENCY_SOURCES.has(source)) {
      twitchEventLog.add({
        source: "system",
        type: "economy.award",
        message: `Economy award: ${viewer.userLogin} +${normalizedAmount}`,
        data: {
          twitchUserId: viewer.twitchUserId,
          login: viewer.userLogin,
          amount: normalizedAmount,
          balance: wallet.balance,
          source,
        },
      });
    }

    return this.toWalletDto(wallet);
  }

  async spend(twitchUserId: string, amount: number): Promise<WalletDto> {
    const normalizedAmount = this.normalizeAmount(amount);
    const wallet = await this.repository.debitWallet(
      twitchUserId,
      normalizedAmount,
    );

    return this.toWalletDto(wallet);
  }

  async transfer(
    from: EconomyViewerInput,
    to: EconomyViewerInput,
    amount: number,
  ): Promise<{ from: WalletDto; to: WalletDto }> {
    const normalizedAmount = this.normalizeAmount(amount);

    if (from.twitchUserId === to.twitchUserId) {
      throw new Error("CANNOT_TRANSFER_TO_SELF");
    }

    const result = await this.repository.transfer(
      from.twitchUserId,
      to,
      normalizedAmount,
    );

    twitchEventLog.add({
      source: "chat",
      type: "economy.transfer",
      message: `Economy transfer: ${from.userLogin} -> ${to.userLogin} (${normalizedAmount})`,
      data: {
        fromUserId: from.twitchUserId,
        fromLogin: from.userLogin,
        toUserId: to.twitchUserId,
        toLogin: to.userLogin,
        amount: normalizedAmount,
      },
    });

    return {
      from: this.toWalletDto(result.from),
      to: this.toWalletDto(result.to),
    };
  }

  async getBalance(twitchUserId: string): Promise<number> {
    const wallet = await this.repository.findWallet(twitchUserId);
    return wallet?.balance ?? 0;
  }

  async getRank(balance: number): Promise<number> {
    return this.repository.getRank(balance);
  }

  async getWallet(twitchUserId: string): Promise<WalletDto | null> {
    const wallet = await this.repository.findWallet(twitchUserId);
    return wallet ? this.toWalletDto(wallet) : null;
  }

  async getLeaderboard(
    limit = DEFAULT_LEADERBOARD_LIMIT,
  ): Promise<WalletLeaderboardEntry[]> {
    const normalizedLimit = this.normalizeLimit(limit, DEFAULT_LEADERBOARD_LIMIT);
    const wallets = await this.repository.getLeaderboard(normalizedLimit);

    return wallets.map((wallet, index) => ({
      ...this.toWalletDto(wallet),
      rank: index + 1,
    }));
  }

  async getWalletsPage(params: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ entries: WalletLeaderboardEntry[]; total: number }> {
    const limit = this.normalizeLimit(
      params.limit ?? DEFAULT_LEADERBOARD_LIMIT,
      DEFAULT_LEADERBOARD_LIMIT,
    );
    const offset =
      Number.isFinite(params.offset) && params.offset! > 0
        ? Math.floor(params.offset!)
        : 0;

    const { entries, total } = await this.repository.getWalletsPage({
      limit,
      offset,
      search: params.search,
    });

    return {
      entries: entries.map((wallet, index) => ({
        ...this.toWalletDto(wallet),
        rank: offset + index + 1,
      })),
      total,
    };
  }

  async deleteWallet(twitchUserId: string): Promise<boolean> {
    return this.repository.deleteWallet(twitchUserId);
  }

  async deleteSimWallets(): Promise<number> {
    return this.repository.deleteSimWallets();
  }

  private normalizeSettingsInput(
    input: UpdateEconomySettingsInput,
  ): UpdateEconomySettingsInput {
    const normalized: UpdateEconomySettingsInput = {};

    if (input.unit !== undefined) {
      normalized.unit = this.normalizeText(input.unit, "unit", 1, 24);
    }

    if (input.chatActivityPoints !== undefined) {
      normalized.chatActivityPoints = this.normalizeInt(
        input.chatActivityPoints,
        "chatActivityPoints",
        0,
        100_000,
      );
    }

    if (input.chatActivityCooldownSec !== undefined) {
      normalized.chatActivityCooldownSec = this.normalizeInt(
        input.chatActivityCooldownSec,
        "chatActivityCooldownSec",
        0,
        86_400,
      );
    }

    if (input.presencePointsPerTick !== undefined) {
      normalized.presencePointsPerTick = this.normalizeInt(
        input.presencePointsPerTick,
        "presencePointsPerTick",
        0,
        100_000,
      );
    }

    if (input.presenceIntervalMin !== undefined) {
      normalized.presenceIntervalMin = this.normalizeInt(
        input.presenceIntervalMin,
        "presenceIntervalMin",
        1,
        1_440,
      );
    }

    if (input.lurkerReductionPercent !== undefined) {
      normalized.lurkerReductionPercent = this.normalizeInt(
        input.lurkerReductionPercent,
        "lurkerReductionPercent",
        0,
        100,
      );
    }

    if (input.lurkerInactivityMin !== undefined) {
      normalized.lurkerInactivityMin = this.normalizeInt(
        input.lurkerInactivityMin,
        "lurkerInactivityMin",
        1,
        1_440,
      );
    }

    if (input.balanceCommand !== undefined) {
      normalized.balanceCommand = this.normalizeCommandToken(
        input.balanceCommand,
      );
    }

    if (input.topCommand !== undefined) {
      normalized.topCommand = this.normalizeCommandToken(input.topCommand);
    }

    if (input.giveCommand !== undefined) {
      normalized.giveCommand = this.normalizeCommandToken(input.giveCommand);
    }

    if (input.buffListCommand !== undefined) {
      normalized.buffListCommand = this.normalizeCommandToken(
        input.buffListCommand,
      );
    }

    if (input.buffRollCommand !== undefined) {
      normalized.buffRollCommand = this.normalizeCommandToken(
        input.buffRollCommand,
      );
    }

    if (input.buffRollCost !== undefined) {
      normalized.buffRollCost = this.normalizeInt(
        input.buffRollCost,
        "buffRollCost",
        0,
        1_000_000_000,
      );
    }

    if (input.buffRollCooldownSec !== undefined) {
      normalized.buffRollCooldownSec = this.normalizeInt(
        input.buffRollCooldownSec,
        "buffRollCooldownSec",
        0,
        86_400,
      );
    }

    if (input.buffRollChancePercent !== undefined) {
      normalized.buffRollChancePercent = this.normalizeInt(
        input.buffRollChancePercent,
        "buffRollChancePercent",
        0,
        100,
      );
    }

    if (input.rouletteCommand !== undefined) {
      normalized.rouletteCommand = this.normalizeCommandToken(
        input.rouletteCommand,
      );
    }

    if (input.rouletteWinChancePercent !== undefined) {
      normalized.rouletteWinChancePercent = this.normalizeInt(
        input.rouletteWinChancePercent,
        "rouletteWinChancePercent",
        0,
        100,
      );
    }

    if (input.rouletteWinChanceMinPercent !== undefined) {
      normalized.rouletteWinChanceMinPercent = this.normalizeInt(
        input.rouletteWinChanceMinPercent,
        "rouletteWinChanceMinPercent",
        1,
        99,
      );
    }

    if (input.rouletteWinChanceMaxPercent !== undefined) {
      normalized.rouletteWinChanceMaxPercent = this.normalizeInt(
        input.rouletteWinChanceMaxPercent,
        "rouletteWinChanceMaxPercent",
        1,
        99,
      );
    }

    if (input.roulettePayoutPercent !== undefined) {
      normalized.roulettePayoutPercent = this.normalizeInt(
        input.roulettePayoutPercent,
        "roulettePayoutPercent",
        1,
        100_000,
      );
    }

    if (input.rouletteCooldownSec !== undefined) {
      normalized.rouletteCooldownSec = this.normalizeInt(
        input.rouletteCooldownSec,
        "rouletteCooldownSec",
        0,
        86_400,
      );
    }

    if (input.rouletteLeaderLockEnabled !== undefined) {
      normalized.rouletteLeaderLockEnabled = Boolean(
        input.rouletteLeaderLockEnabled,
      );
    }

    if (input.rouletteMinBet !== undefined) {
      normalized.rouletteMinBet = this.normalizeInt(
        input.rouletteMinBet,
        "rouletteMinBet",
        1,
        1_000_000_000,
      );
    }

    if (input.rouletteMaxBet !== undefined) {
      normalized.rouletteMaxBet = this.normalizeInt(
        input.rouletteMaxBet,
        "rouletteMaxBet",
        0,
        1_000_000_000,
      );
    }

    if (input.stealCommand !== undefined) {
      normalized.stealCommand = this.normalizeCommandToken(input.stealCommand);
    }

    if (input.stealChancePercent !== undefined) {
      normalized.stealChancePercent = this.normalizeInt(
        input.stealChancePercent,
        "stealChancePercent",
        0,
        100,
      );
    }

    if (input.stealMinPercent !== undefined) {
      normalized.stealMinPercent = this.normalizeInt(
        input.stealMinPercent,
        "stealMinPercent",
        1,
        100,
      );
    }

    if (input.stealMaxPercent !== undefined) {
      normalized.stealMaxPercent = this.normalizeInt(
        input.stealMaxPercent,
        "stealMaxPercent",
        1,
        100,
      );
    }

    if (input.stealMaxAmount !== undefined) {
      normalized.stealMaxAmount = this.normalizeInt(
        input.stealMaxAmount,
        "stealMaxAmount",
        1,
        1_000_000_000,
      );
    }

    if (input.stealVictimFloor !== undefined) {
      normalized.stealVictimFloor = this.normalizeInt(
        input.stealVictimFloor,
        "stealVictimFloor",
        0,
        1_000_000_000,
      );
    }

    if (input.stealThiefCooldownSec !== undefined) {
      normalized.stealThiefCooldownSec = this.normalizeInt(
        input.stealThiefCooldownSec,
        "stealThiefCooldownSec",
        0,
        86_400,
      );
    }

    if (input.stealVictimImmunitySec !== undefined) {
      normalized.stealVictimImmunitySec = this.normalizeInt(
        input.stealVictimImmunitySec,
        "stealVictimImmunitySec",
        0,
        86_400,
      );
    }

    if (input.stealFinePercent !== undefined) {
      normalized.stealFinePercent = this.normalizeInt(
        input.stealFinePercent,
        "stealFinePercent",
        0,
        100,
      );
    }

    if (input.stealWarnSeconds !== undefined) {
      normalized.stealWarnSeconds = this.normalizeInt(
        input.stealWarnSeconds,
        "stealWarnSeconds",
        0,
        300,
      );
    }

    if (input.shieldCommand !== undefined) {
      normalized.shieldCommand = this.normalizeCommandToken(input.shieldCommand);
    }

    if (input.shieldCost !== undefined) {
      normalized.shieldCost = this.normalizeInt(
        input.shieldCost,
        "shieldCost",
        0,
        1_000_000_000,
      );
    }

    if (input.shieldDurationMin !== undefined) {
      normalized.shieldDurationMin = this.normalizeInt(
        input.shieldDurationMin,
        "shieldDurationMin",
        1,
        1_440,
      );
    }

    if (input.fightCommand !== undefined) {
      normalized.fightCommand = this.normalizeCommandToken(input.fightCommand);
    }

    if (input.fightAcceptCommand !== undefined) {
      normalized.fightAcceptCommand = this.normalizeCommandToken(
        input.fightAcceptCommand,
      );
    }

    if (input.fightWinChancePercent !== undefined) {
      normalized.fightWinChancePercent = this.normalizeInt(
        input.fightWinChancePercent,
        "fightWinChancePercent",
        0,
        100,
      );
    }

    if (input.fightCooldownSec !== undefined) {
      normalized.fightCooldownSec = this.normalizeInt(
        input.fightCooldownSec,
        "fightCooldownSec",
        0,
        86_400,
      );
    }

    if (input.fightChallengeTimeoutSec !== undefined) {
      normalized.fightChallengeTimeoutSec = this.normalizeInt(
        input.fightChallengeTimeoutSec,
        "fightChallengeTimeoutSec",
        5,
        600,
      );
    }

    if (input.fightMinBet !== undefined) {
      normalized.fightMinBet = this.normalizeInt(
        input.fightMinBet,
        "fightMinBet",
        1,
        1_000_000_000,
      );
    }

    if (input.fightMaxBet !== undefined) {
      normalized.fightMaxBet = this.normalizeInt(
        input.fightMaxBet,
        "fightMaxBet",
        0,
        1_000_000_000,
      );
    }

    if (input.statusCommand !== undefined) {
      normalized.statusCommand = this.normalizeCommandToken(input.statusCommand);
    }

    if (input.helpCommand !== undefined) {
      normalized.helpCommand = this.normalizeCommandToken(input.helpCommand);
    }

    if (input.messages !== undefined) {
      normalized.messages = normalizeEconomyMessages(input.messages);
    }

    return normalized;
  }

  private toSettingsDto(row: EconomySettings): EconomySettingsDto {
    return {
      unit: row.unit,
      chatActivityPoints: row.chatActivityPoints,
      chatActivityCooldownSec: row.chatActivityCooldownSec,
      presencePointsPerTick: row.presencePointsPerTick,
      presenceIntervalMin: row.presenceIntervalMin,
      lurkerReductionPercent: row.lurkerReductionPercent,
      lurkerInactivityMin: row.lurkerInactivityMin,
      balanceCommand: row.balanceCommand,
      topCommand: row.topCommand,
      giveCommand: row.giveCommand,
      buffListCommand: row.buffListCommand,
      buffRollCommand: row.buffRollCommand,
      buffRollCost: row.buffRollCost,
      buffRollCooldownSec: row.buffRollCooldownSec,
      buffRollChancePercent: row.buffRollChancePercent,
      rouletteCommand: row.rouletteCommand,
      rouletteWinChancePercent: row.rouletteWinChancePercent,
      rouletteWinChanceMinPercent: row.rouletteWinChanceMinPercent,
      rouletteWinChanceMaxPercent: row.rouletteWinChanceMaxPercent,
      roulettePayoutPercent: row.roulettePayoutPercent,
      rouletteCooldownSec: row.rouletteCooldownSec,
      rouletteLeaderLockEnabled: row.rouletteLeaderLockEnabled,
      rouletteMinBet: row.rouletteMinBet,
      rouletteMaxBet: row.rouletteMaxBet,
      stealCommand: row.stealCommand,
      stealChancePercent: row.stealChancePercent,
      stealMinPercent: row.stealMinPercent,
      stealMaxPercent: row.stealMaxPercent,
      stealMaxAmount: row.stealMaxAmount,
      stealVictimFloor: row.stealVictimFloor,
      stealThiefCooldownSec: row.stealThiefCooldownSec,
      stealVictimImmunitySec: row.stealVictimImmunitySec,
      stealFinePercent: row.stealFinePercent,
      stealWarnSeconds: row.stealWarnSeconds,
      shieldCommand: row.shieldCommand,
      shieldCost: row.shieldCost,
      shieldDurationMin: row.shieldDurationMin,
      fightCommand: row.fightCommand,
      fightAcceptCommand: row.fightAcceptCommand,
      fightWinChancePercent: row.fightWinChancePercent,
      fightCooldownSec: row.fightCooldownSec,
      fightChallengeTimeoutSec: row.fightChallengeTimeoutSec,
      fightMinBet: row.fightMinBet,
      fightMaxBet: row.fightMaxBet,
      statusCommand: row.statusCommand,
      helpCommand: row.helpCommand,
      messages: normalizeEconomyMessages(row.messages),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toWalletDto(wallet: ViewerWallet): WalletDto {
    return {
      id: wallet.id,
      twitchUserId: wallet.twitchUserId,
      userLogin: wallet.userLogin,
      displayName: wallet.displayName,
      balance: wallet.balance,
      earnedTotal: wallet.earnedTotal,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  private normalizeAmount(value: number): number {
    if (!Number.isFinite(value)) {
      throw new Error("Amount must be a number");
    }

    const normalized = Math.floor(value);

    if (normalized < 1 || normalized > MAX_AMOUNT) {
      throw new Error(`Amount must be between 1 and ${MAX_AMOUNT}`);
    }

    return normalized;
  }

  private normalizeInt(
    value: number,
    fieldName: string,
    min: number,
    max: number,
  ): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a number`);
    }

    const normalized = Math.floor(value);

    if (normalized < min || normalized > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }

    return normalized;
  }

  private normalizeText(
    value: string,
    fieldName: string,
    minLength: number,
    maxLength: number,
  ): string {
    const normalized = value.trim();

    if (normalized.length < minLength || normalized.length > maxLength) {
      throw new Error(`${fieldName} must be ${minLength}-${maxLength} chars`);
    }

    return normalized;
  }

  private normalizeCommandToken(value: string): string {
    const normalized = value.trim().replace(/^!+/, "").toLocaleLowerCase();

    if (!normalized || /\s/.test(normalized)) {
      throw new Error("Command tokens cannot be empty or contain spaces");
    }

    return normalized;
  }

  private normalizeLimit(limit: number, fallback: number): number {
    return Number.isFinite(limit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
      : fallback;
  }
}
