export const GIVEAWAY_SETTINGS_KEY = "giveaway";

export type GiveawayWinnersMode = "fixed" | "dynamic";

export type GiveawayPreset = {
  commandName: string;
  winnersMode: GiveawayWinnersMode;
  fixedWinners: number;
  minWinners: number;
  maxWinners: number;
  participantsForMax: number;
  enabled: boolean;
};

export type GiveawayMessages = {
  start: string;
  reminder: string;
  winners: string;
  noParticipants: string;
  alreadyRunning: string;
  notAllowed: string;
  invalidAmount: string;
  selfStart: string;
  selfInsufficient: string;
  selfRefunded: string;
};

export type GiveawaySettingsDto = {
  joinKeyword: string;
  selfCommand: string;
  maxAmount: number;
  durationSeconds: number;
  reminderMinSeconds: number;
  reminderMaxSeconds: number;
  presets: GiveawayPreset[];
  messages: GiveawayMessages;
  updatedAt: string;
};

export type UpdateGiveawaySettingsInput = Partial<
  Omit<GiveawaySettingsDto, "updatedAt">
>;

export type GiveawayViewerInput = {
  twitchUserId: string;
  userLogin: string;
  displayName?: string | null;
};

export const defaultGiveawayPresets: GiveawayPreset[] = [
  {
    commandName: "розіграш",
    winnersMode: "dynamic",
    fixedWinners: 1,
    minWinners: 1,
    maxWinners: 10,
    participantsForMax: 100,
    enabled: true,
  },
  {
    commandName: "розіграш1",
    winnersMode: "fixed",
    fixedWinners: 1,
    minWinners: 1,
    maxWinners: 1,
    participantsForMax: 100,
    enabled: true,
  },
];

export const defaultGiveawayMessages: GiveawayMessages = {
  start:
    "🎉 Розіграш {amount} {unit}! Напиши !{joinKeyword}, щоб взяти участь. Часу: {seconds} с.",
  reminder:
    "⏳ Розіграш {amount} {unit}: лишилось {secondsLeft} с. Учасників: {participantsCount}. Пиши !{joinKeyword}",
  winners:
    "🏆 Переможці ({amount} {unit}): {winners}. Кожному по {perWinner} {unit}!",
  noParticipants: "😕 Розіграш скасовано — ніхто не взяв участь.",
  alreadyRunning: "@{displayName}, розіграш уже триває.",
  notAllowed:
    "@{displayName}, лише модератор або стрімер може запускати розіграш.",
  invalidAmount: "@{displayName}, вкажи суму: !{commandName} 1000.",
  selfStart:
    "🎉 @{displayName} розіграє свої {amount} {unit}! Напиши !{joinKeyword}, щоб взяти участь. Часу: {seconds} с.",
  selfInsufficient:
    "@{displayName}, недостатньо балів для розіграшу {amount} {unit}. Баланс: {balance} {unit}.",
  selfRefunded:
    "😕 Розіграш скасовано — ніхто не взяв участь. @{displayName}, повертаємо {amount} {unit}.",
};

export function normalizeGiveawayPresets(value: unknown): GiveawayPreset[] {
  if (!Array.isArray(value)) {
    return defaultGiveawayPresets;
  }

  const presets = value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => normalizePreset(item))
    .filter((preset): preset is GiveawayPreset => preset !== null);

  return presets.length > 0 ? presets : defaultGiveawayPresets;
}

export function normalizeGiveawayMessages(value: unknown): GiveawayMessages {
  if (!isRecord(value)) {
    return defaultGiveawayMessages;
  }

  return {
    start: normalizeTemplate(value.start, defaultGiveawayMessages.start),
    reminder: normalizeTemplate(value.reminder, defaultGiveawayMessages.reminder),
    winners: normalizeTemplate(value.winners, defaultGiveawayMessages.winners),
    noParticipants: normalizeTemplate(
      value.noParticipants,
      defaultGiveawayMessages.noParticipants,
    ),
    alreadyRunning: normalizeTemplate(
      value.alreadyRunning,
      defaultGiveawayMessages.alreadyRunning,
    ),
    notAllowed: normalizeTemplate(
      value.notAllowed,
      defaultGiveawayMessages.notAllowed,
    ),
    invalidAmount: normalizeTemplate(
      value.invalidAmount,
      defaultGiveawayMessages.invalidAmount,
    ),
    selfStart: normalizeTemplate(
      value.selfStart,
      defaultGiveawayMessages.selfStart,
    ),
    selfInsufficient: normalizeTemplate(
      value.selfInsufficient,
      defaultGiveawayMessages.selfInsufficient,
    ),
    selfRefunded: normalizeTemplate(
      value.selfRefunded,
      defaultGiveawayMessages.selfRefunded,
    ),
  };
}

function normalizePreset(item: Record<string, unknown>): GiveawayPreset | null {
  const commandName =
    typeof item.commandName === "string"
      ? item.commandName.trim().replace(/^!+/, "").toLocaleLowerCase()
      : "";

  if (!commandName || /\s/.test(commandName)) {
    return null;
  }

  const winnersMode: GiveawayWinnersMode =
    item.winnersMode === "fixed" ? "fixed" : "dynamic";

  return {
    commandName,
    winnersMode,
    fixedWinners: clampInt(item.fixedWinners, 1, 1, 1000),
    minWinners: clampInt(item.minWinners, 1, 1, 1000),
    maxWinners: clampInt(item.maxWinners, 10, 1, 1000),
    participantsForMax: clampInt(item.participantsForMax, 100, 1, 1_000_000),
    enabled: item.enabled !== false,
  };
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(value)));
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
