import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  PrismaClient,
  SupporterSettings,
  SupporterStatus,
} from "../../../generated/prisma/client.js";
import {
  SUPPORTER_SETTINGS_KEY,
  defaultSupporterMessages,
  type AddManualSupporterInput,
  type UpdateSupporterSettingsInput,
} from "./supporter.types.js";

/** AppSetting key holding the chain of stream-days (YYYY-MM-DD) used to detect
 * missed streams for streak accounting. */
const STREAK_CHAIN_KEY = "supporter_streak_chain";

export type ExtendStreakInput = {
  userLogin: string;
  twitchUserId?: string | null;
  displayName?: string | null;
  day: string;
};

export class SupporterRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  // ----- Settings -----

  async getSettingsRow(): Promise<SupporterSettings> {
    const existing = await this.db.supporterSettings.findUnique({
      where: { key: SUPPORTER_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.supporterSettings.create({
      data: {
        key: SUPPORTER_SETTINGS_KEY,
        messages:
          defaultSupporterMessages as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(
    input: UpdateSupporterSettingsInput,
  ): Promise<SupporterSettings> {
    await this.getSettingsRow();

    return this.db.supporterSettings.update({
      where: { key: SUPPORTER_SETTINGS_KEY },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.loyalStreakDays !== undefined
          ? { loyalStreakDays: input.loyalStreakDays }
          : {}),
        ...(input.streakResetOnMissedStream !== undefined
          ? { streakResetOnMissedStream: input.streakResetOnMissedStream }
          : {}),
        ...(input.loyalMultiplier !== undefined
          ? { loyalMultiplier: input.loyalMultiplier }
          : {}),
        ...(input.supporterMultiplier !== undefined
          ? { supporterMultiplier: input.supporterMultiplier }
          : {}),
        ...(input.bonusCommand !== undefined
          ? { bonusCommand: input.bonusCommand }
          : {}),
        ...(input.bonusCooldownSec !== undefined
          ? { bonusCooldownSec: input.bonusCooldownSec }
          : {}),
        ...(input.guestDailyBonus !== undefined
          ? { guestDailyBonus: input.guestDailyBonus }
          : {}),
        ...(input.loyalDailyBonus !== undefined
          ? { loyalDailyBonus: input.loyalDailyBonus }
          : {}),
        ...(input.supporterDailyBonus !== undefined
          ? { supporterDailyBonus: input.supporterDailyBonus }
          : {}),
        ...(input.guestStreakBonus !== undefined
          ? { guestStreakBonus: input.guestStreakBonus }
          : {}),
        ...(input.loyalStreakBonus !== undefined
          ? { loyalStreakBonus: input.loyalStreakBonus }
          : {}),
        ...(input.supporterStreakBonus !== undefined
          ? { supporterStreakBonus: input.supporterStreakBonus }
          : {}),
        ...(input.supporterSongPriority !== undefined
          ? { supporterSongPriority: input.supporterSongPriority }
          : {}),
        ...(input.messages !== undefined
          ? { messages: input.messages as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  // ----- Per-viewer status -----

  async getStatusByLogin(login: string): Promise<SupporterStatus | null> {
    return this.db.supporterStatus.findUnique({
      where: { userLogin: login.toLocaleLowerCase() },
    });
  }

  /** Rows currently in the manual supporter allowlist. */
  async listManualSupporters(): Promise<SupporterStatus[]> {
    return this.db.supporterStatus.findMany({
      where: { manualTier: "supporter" },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Add or refresh a manual supporter (the admin-managed stub list). */
  async addManualSupporter(
    input: AddManualSupporterInput,
  ): Promise<SupporterStatus> {
    const login = input.userLogin.toLocaleLowerCase();

    return this.db.supporterStatus.upsert({
      where: { userLogin: login },
      create: {
        userLogin: login,
        twitchUserId: input.twitchUserId ?? null,
        displayName: input.displayName ?? null,
        manualTier: "supporter",
        manualUntil: input.manualUntil ?? null,
        note: input.note ?? null,
      },
      update: {
        manualTier: "supporter",
        manualUntil: input.manualUntil ?? null,
        ...(input.twitchUserId !== undefined
          ? { twitchUserId: input.twitchUserId }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
  }

  /**
   * Remove someone from the manual supporter list. Keeps the row if it still
   * carries a streak or a mono subscription (so we don't wipe earned loyal
   * progress); otherwise deletes it to keep the table tidy.
   */
  async removeManualSupporter(login: string): Promise<void> {
    const key = login.toLocaleLowerCase();
    const row = await this.db.supporterStatus.findUnique({
      where: { userLogin: key },
    });
    if (!row) {
      return;
    }

    if (row.streakDays <= 0 && !row.monoSubId) {
      await this.db.supporterStatus.delete({ where: { userLogin: key } });
      return;
    }

    await this.db.supporterStatus.update({
      where: { userLogin: key },
      data: { manualTier: null, manualUntil: null },
    });
  }

  // ----- Presence streak (drives the free `loyal` tier) -----

  /** Ordered list of stream-days seen so far (oldest → newest). */
  async getStreakChain(): Promise<string[]> {
    const row = await this.db.appSetting.findUnique({
      where: { key: STREAK_CHAIN_KEY },
    });
    const value = row?.value as { days?: unknown } | null;
    if (value && Array.isArray(value.days)) {
      return value.days.filter((day): day is string => typeof day === "string");
    }
    return [];
  }

  async setStreakChain(days: string[]): Promise<void> {
    const value = { days } as unknown as Prisma.InputJsonValue;
    await this.db.appSetting.upsert({
      where: { key: STREAK_CHAIN_KEY },
      create: { key: STREAK_CHAIN_KEY, value },
      update: { value },
    });
  }

  /**
   * Reset streaks that lapsed: anyone with a running streak whose last counted
   * stream-day is older than `beforeDay` (i.e. they missed the previous stream).
   */
  async resetLapsedStreaks(beforeDay: string): Promise<void> {
    await this.db.supporterStatus.updateMany({
      where: {
        streakDays: { gt: 0 },
        OR: [{ lastStreamDay: null }, { lastStreamDay: { lt: beforeDay } }],
      },
      data: { streakDays: 0 },
    });
  }

  /** Count one stream-day of presence for a viewer (idempotent per day). */
  async extendStreak(input: ExtendStreakInput): Promise<void> {
    const key = input.userLogin.toLocaleLowerCase();
    const existing = await this.db.supporterStatus.findUnique({
      where: { userLogin: key },
    });

    if (!existing) {
      await this.db.supporterStatus.create({
        data: {
          userLogin: key,
          twitchUserId: input.twitchUserId ?? null,
          displayName: input.displayName ?? null,
          streakDays: 1,
          lastStreamDay: input.day,
        },
      });
      return;
    }

    if (existing.lastStreamDay === input.day) {
      return;
    }

    await this.db.supporterStatus.update({
      where: { userLogin: key },
      data: {
        streakDays: { increment: 1 },
        lastStreamDay: input.day,
        ...(existing.twitchUserId || !input.twitchUserId
          ? {}
          : { twitchUserId: input.twitchUserId }),
        ...(existing.displayName || !input.displayName
          ? {}
          : { displayName: input.displayName }),
      },
    });
  }

  // ----- Daily bonus claim -----

  /** Record a daily-bonus claim time (creating the row if needed). */
  async setBonusClaimedAt(input: {
    userLogin: string;
    at: Date;
    twitchUserId?: string | null;
    displayName?: string | null;
  }): Promise<void> {
    const key = input.userLogin.toLocaleLowerCase();

    await this.db.supporterStatus.upsert({
      where: { userLogin: key },
      create: {
        userLogin: key,
        twitchUserId: input.twitchUserId ?? null,
        displayName: input.displayName ?? null,
        lastBonusAt: input.at,
      },
      update: {
        lastBonusAt: input.at,
        ...(input.twitchUserId !== undefined
          ? { twitchUserId: input.twitchUserId }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
      },
    });
  }

  // ----- Testing helpers (used by the simulator) -----

  /** Force a viewer's streak to a value (to test the `loyal` tier offline). */
  async setStreak(login: string, streakDays: number, day: string): Promise<void> {
    const key = login.toLocaleLowerCase();
    await this.db.supporterStatus.upsert({
      where: { userLogin: key },
      create: { userLogin: key, streakDays, lastStreamDay: day },
      update: { streakDays, lastStreamDay: day },
    });
  }

  /** Clear a viewer's daily-bonus cooldown (to re-test !бонус immediately). */
  async clearBonus(login: string): Promise<void> {
    await this.db.supporterStatus.updateMany({
      where: { userLogin: login.toLocaleLowerCase() },
      data: { lastBonusAt: null },
    });
  }
}
