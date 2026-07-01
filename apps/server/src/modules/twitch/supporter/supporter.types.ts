export const SUPPORTER_SETTINGS_KEY = "supporter";

/**
 * Perk tiers, cumulative: supporter ⊇ loyal ⊇ guest.
 * - guest: everyone by default.
 * - loyal: FREE, earned via consecutive stream-day presence streak.
 * - supporter: PAID — manual admin allowlist now, mono subscription later.
 */
export type SupporterTier = "guest" | "loyal" | "supporter";

export const SUPPORTER_TIERS: SupporterTier[] = ["guest", "loyal", "supporter"];

export type SupporterMessages = {
  bonusClaimed: string;
  bonusCooldown: string;
  bonusDisabled: string;
  loyalBadge: string;
  supporterBadge: string;
  greetingLoyal: string;
  greetingSupporter: string;
  tierGuest: string;
  tierLoyal: string;
  tierSupporter: string;
};

export type SupporterSettingsDto = {
  enabled: boolean;
  // loyal is earned via a consecutive stream-day streak
  loyalStreakDays: number;
  streakResetOnMissedStream: boolean;
  // currency earn multiplier per tier (guest baseline is always 1.0)
  loyalMultiplier: number;
  supporterMultiplier: number;
  // daily bonus claim command
  bonusCommand: string;
  bonusCooldownSec: number;
  guestDailyBonus: number;
  loyalDailyBonus: number;
  supporterDailyBonus: number;
  // bonus awarded per stream-day for keeping the presence streak
  guestStreakBonus: number;
  loyalStreakBonus: number;
  supporterStreakBonus: number;
  // base priority a supporter's song gets (real donations use amount, usually higher)
  supporterSongPriority: number;
  messages: SupporterMessages;
  updatedAt: string;
};

export type UpdateSupporterSettingsInput = Partial<
  Omit<SupporterSettingsDto, "updatedAt">
>;

export type SupporterStatusDto = {
  userLogin: string;
  twitchUserId: string | null;
  displayName: string | null;
  /** Resolved effective tier (computed from manual/mono/streak + settings). */
  tier: SupporterTier;
  manualTier: string | null;
  manualUntil: string | null;
  monoUntil: string | null;
  streakDays: number;
  lastStreamDay: string | null;
  note: string | null;
  updatedAt: string;
};

export type AddManualSupporterInput = {
  userLogin: string;
  displayName?: string | null;
  twitchUserId?: string | null;
  manualUntil?: Date | null;
  note?: string | null;
};

export const defaultSupporterMessages: SupporterMessages = {
  bonusClaimed:
    "🎁 @{displayName}, щоденний бонус: +{amount} {unit}! (рівень: {tier})",
  bonusCooldown:
    "@{displayName}, бонус уже отримано. Повертайся через {timeLeft}.",
  bonusDisabled: "@{displayName}, щоденний бонус зараз вимкнено.",
  loyalBadge: "🔵",
  supporterBadge: "🟣",
  greetingLoyal: "🔵 Вітаю, {displayName}!",
  greetingSupporter:
    "🟣 З поверненням, {displayName}! Дякую за підтримку 💜",
  tierGuest: "Гість",
  tierLoyal: "Активний",
  tierSupporter: "Підписник",
};

export function normalizeSupporterMessages(value: unknown): SupporterMessages {
  if (!isRecord(value)) {
    return defaultSupporterMessages;
  }

  return {
    bonusClaimed: normalizeTemplate(
      value.bonusClaimed,
      defaultSupporterMessages.bonusClaimed,
    ),
    bonusCooldown: normalizeTemplate(
      value.bonusCooldown,
      defaultSupporterMessages.bonusCooldown,
    ),
    bonusDisabled: normalizeTemplate(
      value.bonusDisabled,
      defaultSupporterMessages.bonusDisabled,
    ),
    loyalBadge: normalizeTemplate(
      value.loyalBadge,
      defaultSupporterMessages.loyalBadge,
    ),
    supporterBadge: normalizeTemplate(
      value.supporterBadge,
      defaultSupporterMessages.supporterBadge,
    ),
    greetingLoyal: normalizeTemplate(
      value.greetingLoyal,
      defaultSupporterMessages.greetingLoyal,
    ),
    greetingSupporter: normalizeTemplate(
      value.greetingSupporter,
      defaultSupporterMessages.greetingSupporter,
    ),
    tierGuest: normalizeTemplate(
      value.tierGuest,
      defaultSupporterMessages.tierGuest,
    ),
    tierLoyal: normalizeTemplate(
      value.tierLoyal,
      defaultSupporterMessages.tierLoyal,
    ),
    tierSupporter: normalizeTemplate(
      value.tierSupporter,
      defaultSupporterMessages.tierSupporter,
    ),
  };
}

export function normalizeCommandName(value: string, fallback: string): string {
  const normalized = value.trim().replace(/^!+/, "").toLocaleLowerCase();
  return normalized && !/\s/.test(normalized) ? normalized : fallback;
}

/** Clamp a value to an integer >= min (used for perk amounts). */
export function clampInt(value: unknown, fallback: number, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.round(value));
}

/** Clamp a multiplier to a finite float >= min. */
export function clampFloat(value: unknown, fallback: number, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, value);
}

function normalizeTemplate(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
