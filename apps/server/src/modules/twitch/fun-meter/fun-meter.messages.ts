export type FunMeterMessageTemplates = {
  rollMessage: string;
  zeroBlockedMessage: string;
  rollChatMessage: string;
  zeroBlockedChatMessage: string;
  dailyLimitMessage: string;
  leaderboardTitle: string;
  leaderboardEmpty: string;
  leaderboardEntry: string;
  selfScoreMessage: string;
  unknownSubcommandMessage: string;
};

export const defaultFunMeterMessages: FunMeterMessageTemplates = {
  rollMessage: "{deltaWithSign} {unit}. {joke}",
  zeroBlockedMessage: "бот хотів відняти {amount}, але там уже 0. {joke}",
  rollChatMessage: "@{displayName} {message} Загалом: {score} {unit}.",
  zeroBlockedChatMessage: "@{displayName}, {message}",
  dailyLimitMessage:
    "@{displayName}, «{title}» можна використовувати раз на добу. Спробуй після опівночі або після перезапуску бота.",
  leaderboardTitle: "🏆 Топ «{title}»:",
  leaderboardEmpty: "🏆 Топ «{title}» поки порожній.",
  leaderboardEntry: "{rank}. {displayName} — {score} {unit}",
  selfScoreMessage:
    "@{displayName}, твій поточний результат у «{title}»: {score} {unit}. Позиція в рейтингу: #{rank}.",
  unknownSubcommandMessage:
    "@{displayName}, доступно: !{alias}, !{alias} top, !{alias} me.",
};

export function normalizeFunMeterMessages(
  value: unknown,
): FunMeterMessageTemplates {
  if (!isRecord(value)) {
    return defaultFunMeterMessages;
  }

  return {
    rollMessage: normalizeTemplate(value.rollMessage, defaultFunMeterMessages.rollMessage),
    zeroBlockedMessage: normalizeTemplate(
      value.zeroBlockedMessage,
      defaultFunMeterMessages.zeroBlockedMessage,
    ),
    rollChatMessage: normalizeTemplate(
      value.rollChatMessage,
      defaultFunMeterMessages.rollChatMessage,
    ),
    zeroBlockedChatMessage: normalizeTemplate(
      value.zeroBlockedChatMessage,
      defaultFunMeterMessages.zeroBlockedChatMessage,
    ),
    dailyLimitMessage: normalizeTemplate(
      value.dailyLimitMessage,
      defaultFunMeterMessages.dailyLimitMessage,
    ),
    leaderboardTitle: normalizeTemplate(
      value.leaderboardTitle,
      defaultFunMeterMessages.leaderboardTitle,
    ),
    leaderboardEmpty: normalizeTemplate(
      value.leaderboardEmpty,
      defaultFunMeterMessages.leaderboardEmpty,
    ),
    leaderboardEntry: normalizeTemplate(
      value.leaderboardEntry,
      defaultFunMeterMessages.leaderboardEntry,
    ),
    selfScoreMessage: normalizeTemplate(
      value.selfScoreMessage,
      defaultFunMeterMessages.selfScoreMessage,
    ),
    unknownSubcommandMessage: normalizeTemplate(
      value.unknownSubcommandMessage,
      defaultFunMeterMessages.unknownSubcommandMessage,
    ),
  };
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
