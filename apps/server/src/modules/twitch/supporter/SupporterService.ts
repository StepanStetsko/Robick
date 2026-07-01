import type {
  SupporterSettings,
  SupporterStatus,
} from "../../../generated/prisma/client.js";
import { logger } from "../../../core/logger/logger.js";
import { SupporterRepository } from "./SupporterRepository.js";
import {
  clampFloat,
  clampInt,
  normalizeCommandName,
  normalizeSupporterMessages,
  type AddManualSupporterInput,
  type SupporterSettingsDto,
  type SupporterStatusDto,
  type SupporterTier,
  type UpdateSupporterSettingsInput,
} from "./supporter.types.js";

const SETTINGS_TTL_MS = 30_000;

export type SupporterPerks = {
  tier: SupporterTier;
  /** Currency earn multiplier for this tier (guest = 1.0). */
  earnMultiplier: number;
  /** Daily bonus claim amount for this tier. */
  dailyBonus: number;
  /** Presence-streak bonus per stream-day for this tier. */
  streakBonus: number;
};

export type PresenceChatter = {
  user_id: string;
  user_login: string;
  user_name: string;
};

export type BonusContext = {
  enabled: boolean;
  tier: SupporterTier;
  dailyBonus: number;
  streakBonus: number;
  streakDays: number;
  lastBonusAt: Date | null;
  cooldownSec: number;
};

export type SupporterInspect = {
  login: string;
  enabled: boolean;
  tier: SupporterTier;
  earnMultiplier: number;
  dailyBonus: number;
  streakBonus: number;
  streakDays: number;
  loyalStreakDays: number;
  songPriority: number;
  manualTier: string | null;
  monoUntil: string | null;
  bonusReadyInSec: number;
  greetingPreview: string | null;
};

export class SupporterService {
  private settingsCache: { value: SupporterSettingsDto; at: number } | null =
    null;
  // Streak bookkeeping: which stream-day we're currently counting and which
  // logins already got their +1 for it (so repeated polls don't double-count).
  private streakDay: string | null = null;
  private countedToday = new Set<string>();
  // Greeting bookkeeping: greet each viewer at most once per day.
  private greetedDay: string | null = null;
  private greeted = new Set<string>();

  constructor(private readonly repo: SupporterRepository) {}

  async getSettings(): Promise<SupporterSettingsDto> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.value;
    }

    const row = await this.repo.getSettingsRow();
    const value = toSettingsDto(row);
    this.settingsCache = { value, at: now };
    return value;
  }

  async updateSettings(
    input: UpdateSupporterSettingsInput,
  ): Promise<SupporterSettingsDto> {
    const normalized: UpdateSupporterSettingsInput = {
      ...input,
      ...(input.bonusCommand !== undefined
        ? { bonusCommand: normalizeCommandName(input.bonusCommand, "бонус") }
        : {}),
      ...(input.loyalStreakDays !== undefined
        ? { loyalStreakDays: clampInt(input.loyalStreakDays, 5, 1) }
        : {}),
      ...(input.bonusCooldownSec !== undefined
        ? { bonusCooldownSec: clampInt(input.bonusCooldownSec, 86_400, 0) }
        : {}),
      ...(input.loyalMultiplier !== undefined
        ? { loyalMultiplier: clampFloat(input.loyalMultiplier, 1.5, 1) }
        : {}),
      ...(input.supporterMultiplier !== undefined
        ? { supporterMultiplier: clampFloat(input.supporterMultiplier, 2.5, 1) }
        : {}),
      ...(input.guestDailyBonus !== undefined
        ? { guestDailyBonus: clampInt(input.guestDailyBonus, 50) }
        : {}),
      ...(input.loyalDailyBonus !== undefined
        ? { loyalDailyBonus: clampInt(input.loyalDailyBonus, 150) }
        : {}),
      ...(input.supporterDailyBonus !== undefined
        ? { supporterDailyBonus: clampInt(input.supporterDailyBonus, 400) }
        : {}),
      ...(input.guestStreakBonus !== undefined
        ? { guestStreakBonus: clampInt(input.guestStreakBonus, 10) }
        : {}),
      ...(input.loyalStreakBonus !== undefined
        ? { loyalStreakBonus: clampInt(input.loyalStreakBonus, 25) }
        : {}),
      ...(input.supporterStreakBonus !== undefined
        ? { supporterStreakBonus: clampInt(input.supporterStreakBonus, 60) }
        : {}),
      ...(input.supporterSongPriority !== undefined
        ? { supporterSongPriority: clampInt(input.supporterSongPriority, 1) }
        : {}),
    };

    await this.repo.updateSettings(normalized);
    this.settingsCache = null;
    return this.getSettings();
  }

  /** Resolve a viewer's effective tier from their status + current settings. */
  async resolveTier(login: string): Promise<SupporterTier> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return "guest";
    }
    const row = await this.repo.getStatusByLogin(login);
    return computeTier(row, settings.loyalStreakDays);
  }

  /** Priority a viewer's song request gets (supporters queue-jump like a donation). */
  async resolveSongPriority(login: string): Promise<number> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return 0;
    }
    const tier = computeTier(
      await this.repo.getStatusByLogin(login),
      settings.loyalStreakDays,
    );
    return tier === "supporter" ? settings.supporterSongPriority : 0;
  }

  /** Resolve a viewer's tier together with the perk values that apply to it. */
  async resolvePerks(login: string): Promise<SupporterPerks> {
    const settings = await this.getSettings();
    const tier = settings.enabled
      ? computeTier(await this.repo.getStatusByLogin(login), settings.loyalStreakDays)
      : "guest";
    return perksForTier(tier, settings);
  }

  // ----- Inspect + testing helpers (simulator) -----

  /** Full resolved perk snapshot for a login (for the simulator/inspect panel). */
  async inspect(login: string): Promise<SupporterInspect> {
    const settings = await this.getSettings();
    const row = await this.repo.getStatusByLogin(login);
    const tier = settings.enabled
      ? computeTier(row, settings.loyalStreakDays)
      : "guest";
    const perks = perksForTier(tier, settings);

    let bonusReadyInSec = 0;
    if (row?.lastBonusAt) {
      const remainingMs =
        settings.bonusCooldownSec * 1000 -
        (Date.now() - row.lastBonusAt.getTime());
      bonusReadyInSec = Math.max(0, Math.ceil(remainingMs / 1000));
    }

    let greetingPreview: string | null = null;
    if (tier !== "guest") {
      const template =
        tier === "supporter"
          ? settings.messages.greetingSupporter
          : settings.messages.greetingLoyal;
      greetingPreview = template.replace(
        /\{([a-zA-Z0-9_]+)\}/g,
        (match, name: string) => (name === "displayName" ? login : match),
      );
    }

    return {
      login: login.toLocaleLowerCase(),
      enabled: settings.enabled,
      tier,
      earnMultiplier: perks.earnMultiplier,
      dailyBonus: perks.dailyBonus,
      streakBonus: perks.streakBonus,
      streakDays: row?.streakDays ?? 0,
      loyalStreakDays: settings.loyalStreakDays,
      songPriority: tier === "supporter" ? settings.supporterSongPriority : 0,
      manualTier: row?.manualTier ?? null,
      monoUntil: row?.monoUntil ? row.monoUntil.toISOString() : null,
      bonusReadyInSec,
      greetingPreview,
    };
  }

  /** Testing: force a viewer's streak (to reach `loyal` without waiting days). */
  async debugSetStreak(login: string, streakDays: number): Promise<void> {
    const clamped = Math.max(0, Math.round(streakDays));
    await this.repo.setStreak(login, clamped, localDayKey());
  }

  /** Testing: clear the daily-bonus cooldown so !бонус can be re-run. */
  async debugResetBonus(login: string): Promise<void> {
    await this.repo.clearBonus(login);
  }

  // ----- Cosmetics: chat-join greeting -----

  /**
   * Return a greeting for a loyal/supporter viewer's first message of the day,
   * or null (guest, disabled, or already greeted today). Each login is checked
   * once per day (one DB read), regardless of tier, to stay cheap on hot chat.
   */
  async maybeGreet(login: string, displayName: string): Promise<string | null> {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      return null;
    }

    const today = localDayKey();
    if (this.greetedDay !== today) {
      this.greetedDay = today;
      this.greeted.clear();
    }

    const key = login.toLocaleLowerCase();
    if (this.greeted.has(key)) {
      return null;
    }
    this.greeted.add(key);

    const tier = computeTier(
      await this.repo.getStatusByLogin(key),
      settings.loyalStreakDays,
    );
    if (tier === "guest") {
      return null;
    }

    const template =
      tier === "supporter"
        ? settings.messages.greetingSupporter
        : settings.messages.greetingLoyal;

    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
      name === "displayName" ? displayName : match,
    );
  }

  // ----- Daily bonus (!бонус) -----

  /** Everything the bonus command needs to decide and compute a claim. */
  async getBonusContext(login: string): Promise<BonusContext> {
    const settings = await this.getSettings();
    const row = await this.repo.getStatusByLogin(login);
    const tier = settings.enabled
      ? computeTier(row, settings.loyalStreakDays)
      : "guest";
    const perks = perksForTier(tier, settings);

    return {
      enabled: settings.enabled,
      tier,
      dailyBonus: perks.dailyBonus,
      streakBonus: perks.streakBonus,
      streakDays: row?.streakDays ?? 0,
      lastBonusAt: row?.lastBonusAt ?? null,
      cooldownSec: settings.bonusCooldownSec,
    };
  }

  async recordBonusClaim(
    login: string,
    at: Date,
    meta?: { twitchUserId?: string | null; displayName?: string | null },
  ): Promise<void> {
    await this.repo.setBonusClaimedAt({
      userLogin: login,
      at,
      twitchUserId: meta?.twitchUserId,
      displayName: meta?.displayName,
    });
  }

  // ----- Presence streak → free `loyal` tier -----

  /**
   * Record that these viewers were present during a live poll. Advances each
   * viewer's streak once per stream-day; opening a new stream-day first burns
   * streaks that lapsed (missed the previous stream). Never throws — a streak
   * hiccup must not break presence earning.
   */
  async notePresence(chatters: PresenceChatter[]): Promise<void> {
    try {
      const settings = await this.getSettings();
      if (!settings.enabled) {
        return;
      }

      const today = localDayKey();
      if (this.streakDay !== today) {
        await this.beginStreamDay(today, settings.streakResetOnMissedStream);
        this.streakDay = today;
        this.countedToday.clear();
      }

      for (const chatter of chatters) {
        const login = chatter.user_login.toLocaleLowerCase();
        if (!login || this.countedToday.has(login)) {
          continue;
        }
        await this.repo.extendStreak({
          userLogin: login,
          twitchUserId: chatter.user_id,
          displayName: chatter.user_name || chatter.user_login,
          day: today,
        });
        this.countedToday.add(login);
      }
    } catch (error) {
      logger.error("Supporter streak update failed", error);
    }
  }

  private async beginStreamDay(
    today: string,
    resetOnMiss: boolean,
  ): Promise<void> {
    const chain = await this.repo.getStreakChain();
    if (chain.includes(today)) {
      // Stream-day already opened (e.g. process restarted mid-day) — the
      // lapse-reset already ran, don't run it again.
      return;
    }

    const prevDay = chain.length > 0 ? chain[chain.length - 1] : null;
    await this.repo.setStreakChain([...chain, today].slice(-90));

    if (resetOnMiss && prevDay) {
      await this.repo.resetLapsedStreaks(prevDay);
    }
  }

  // ----- Manual supporter allowlist (the stub for paid subscriptions) -----

  async listManualSupporters(): Promise<SupporterStatusDto[]> {
    const settings = await this.getSettings();
    const rows = await this.repo.listManualSupporters();
    return rows.map((row) => toStatusDto(row, settings.loyalStreakDays));
  }

  async addManualSupporter(
    input: AddManualSupporterInput,
  ): Promise<SupporterStatusDto> {
    const settings = await this.getSettings();
    const row = await this.repo.addManualSupporter(input);
    return toStatusDto(row, settings.loyalStreakDays);
  }

  async removeManualSupporter(login: string): Promise<void> {
    await this.repo.removeManualSupporter(login);
  }
}

/** Local-day key (YYYY-MM-DD), matching PresenceLogService's day scoping. */
function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeTier(
  row: SupporterStatus | null,
  loyalStreakDays: number,
): SupporterTier {
  if (!row) {
    return "guest";
  }
  const now = Date.now();

  if (
    row.manualTier === "supporter" &&
    (!row.manualUntil || row.manualUntil.getTime() > now)
  ) {
    return "supporter";
  }
  if (row.monoUntil && row.monoUntil.getTime() > now) {
    return "supporter";
  }
  if (row.streakDays >= loyalStreakDays) {
    return "loyal";
  }
  return "guest";
}

function perksForTier(
  tier: SupporterTier,
  settings: SupporterSettingsDto,
): SupporterPerks {
  if (tier === "supporter") {
    return {
      tier,
      earnMultiplier: settings.supporterMultiplier,
      dailyBonus: settings.supporterDailyBonus,
      streakBonus: settings.supporterStreakBonus,
    };
  }
  if (tier === "loyal") {
    return {
      tier,
      earnMultiplier: settings.loyalMultiplier,
      dailyBonus: settings.loyalDailyBonus,
      streakBonus: settings.loyalStreakBonus,
    };
  }
  return {
    tier,
    earnMultiplier: 1,
    dailyBonus: settings.guestDailyBonus,
    streakBonus: settings.guestStreakBonus,
  };
}

function toSettingsDto(row: SupporterSettings): SupporterSettingsDto {
  return {
    enabled: row.enabled,
    loyalStreakDays: row.loyalStreakDays,
    streakResetOnMissedStream: row.streakResetOnMissedStream,
    loyalMultiplier: row.loyalMultiplier,
    supporterMultiplier: row.supporterMultiplier,
    bonusCommand: row.bonusCommand,
    bonusCooldownSec: row.bonusCooldownSec,
    guestDailyBonus: row.guestDailyBonus,
    loyalDailyBonus: row.loyalDailyBonus,
    supporterDailyBonus: row.supporterDailyBonus,
    guestStreakBonus: row.guestStreakBonus,
    loyalStreakBonus: row.loyalStreakBonus,
    supporterStreakBonus: row.supporterStreakBonus,
    supporterSongPriority: row.supporterSongPriority,
    messages: normalizeSupporterMessages(row.messages),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStatusDto(
  row: SupporterStatus,
  loyalStreakDays: number,
): SupporterStatusDto {
  return {
    userLogin: row.userLogin,
    twitchUserId: row.twitchUserId,
    displayName: row.displayName,
    tier: computeTier(row, loyalStreakDays),
    manualTier: row.manualTier,
    manualUntil: row.manualUntil ? row.manualUntil.toISOString() : null,
    monoUntil: row.monoUntil ? row.monoUntil.toISOString() : null,
    streakDays: row.streakDays,
    lastStreamDay: row.lastStreamDay,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}
