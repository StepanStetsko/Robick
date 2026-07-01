export const GUESS_GAME_SETTINGS_KEY = "guess";

export type GuessGameMessages = {
  start: string;
  startTimed: string;
  win: string;
  timeout: string;
  stopped: string;
  alreadyRunning: string;
  notAllowed: string;
  invalidRange: string;
  rangeTooBig: string;
  noActiveGame: string;
};

export type GuessGameSettingsDto = {
  command: string;
  stopCommand: string;
  reward: number;
  maxRange: number;
  maxDurationSeconds: number;
  messages: GuessGameMessages;
  updatedAt: string;
};

export type UpdateGuessGameSettingsInput = Partial<
  Omit<GuessGameSettingsDto, "updatedAt">
>;

export type GuessGameViewerInput = {
  twitchUserId: string;
  userLogin: string;
  displayName?: string | null;
};

export const defaultGuessGameMessages: GuessGameMessages = {
  start:
    "🎲 Я загадав число від {min} до {max}! Хто перший вгадає — отримає {reward} {unit}. Пишіть число в чат!",
  startTimed:
    "🎲 Я загадав число від {min} до {max}! У вас {seconds} с. Хто перший вгадає — отримає {reward} {unit}. Пишіть число!",
  win: "🏆 @{displayName} вгадав число {secret}! +{reward} {unit}. Баланс: {balance}.",
  timeout: "⏰ Час вийшов! Ніхто не вгадав. Загадане число було {secret}.",
  stopped: "🛑 Гру зупинено. Загадане число було {secret}.",
  alreadyRunning:
    "@{displayName}, гра вже триває — пишіть число, щоб вгадати!",
  notAllowed:
    "@{displayName}, лише модератор або стрімер може запускати гру.",
  invalidRange: "@{displayName}, вкажи діапазон: !{command} 1 100 (необов'язково час у секундах).",
  rangeTooBig: "@{displayName}, діапазон завеликий — максимум {maxRange}.",
  noActiveGame: "@{displayName}, зараз немає активної гри.",
};

export function normalizeGuessGameMessages(value: unknown): GuessGameMessages {
  if (!isRecord(value)) {
    return defaultGuessGameMessages;
  }

  return {
    start: normalizeTemplate(value.start, defaultGuessGameMessages.start),
    startTimed: normalizeTemplate(
      value.startTimed,
      defaultGuessGameMessages.startTimed,
    ),
    win: normalizeTemplate(value.win, defaultGuessGameMessages.win),
    timeout: normalizeTemplate(value.timeout, defaultGuessGameMessages.timeout),
    stopped: normalizeTemplate(value.stopped, defaultGuessGameMessages.stopped),
    alreadyRunning: normalizeTemplate(
      value.alreadyRunning,
      defaultGuessGameMessages.alreadyRunning,
    ),
    notAllowed: normalizeTemplate(
      value.notAllowed,
      defaultGuessGameMessages.notAllowed,
    ),
    invalidRange: normalizeTemplate(
      value.invalidRange,
      defaultGuessGameMessages.invalidRange,
    ),
    rangeTooBig: normalizeTemplate(
      value.rangeTooBig,
      defaultGuessGameMessages.rangeTooBig,
    ),
    noActiveGame: normalizeTemplate(
      value.noActiveGame,
      defaultGuessGameMessages.noActiveGame,
    ),
  };
}

export function normalizeCommandName(value: string, fallback: string): string {
  const normalized = value.trim().replace(/^!+/, "").toLocaleLowerCase();
  return normalized && !/\s/.test(normalized) ? normalized : fallback;
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
