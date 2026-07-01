export type SupporterTier = "guest" | "loyal" | "supporter";

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

export type SupporterSettings = {
  enabled: boolean;
  loyalStreakDays: number;
  streakResetOnMissedStream: boolean;
  loyalMultiplier: number;
  supporterMultiplier: number;
  bonusCommand: string;
  bonusCooldownSec: number;
  guestDailyBonus: number;
  loyalDailyBonus: number;
  supporterDailyBonus: number;
  guestStreakBonus: number;
  loyalStreakBonus: number;
  supporterStreakBonus: number;
  supporterSongPriority: number;
  messages: SupporterMessages;
  updatedAt: string;
};

export type UpdateSupporterSettingsInput = Partial<
  Omit<SupporterSettings, "updatedAt">
>;

export type SupporterStatusEntry = {
  userLogin: string;
  twitchUserId: string | null;
  displayName: string | null;
  tier: SupporterTier;
  manualTier: string | null;
  manualUntil: string | null;
  monoUntil: string | null;
  streakDays: number;
  lastStreamDay: string | null;
  note: string | null;
  updatedAt: string;
};

export type AddSupporterInput = {
  userLogin: string;
  displayName?: string | null;
  note?: string | null;
  manualUntil?: string | null;
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
