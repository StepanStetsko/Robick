import type { FunMeterDirection } from "./fun-meter.types.js";

export type FunMeterJokeBuckets = {
  increaseLow: string[];
  increaseMedium: string[];
  increaseHigh: string[];
  decreaseLow: string[];
  decreaseMedium: string[];
  decreaseHigh: string[];
  zeroBlocked: string[];
};

export const defaultFunMeterJokes: FunMeterJokeBuckets = {
  increaseLow: [
    "Сантиметр прокинувся і зробив зарядку.",
    "Маленький крок для стрімера, великий для статистики.",
    "Рулетка кивнула з повагою.",
  ],
  increaseMedium: [
    "Лінійка попросила відпустку.",
    "Статистика сьогодні явно на твоєму боці.",
    "Чат почув впевнене клацання рулетки.",
  ],
  increaseHigh: [
    "Рулетка закінчилась, шукаємо будівельну.",
    "Це вже не вимір, це архітектурний проєкт.",
    "Фізика попросила не ставити зайвих питань.",
  ],
  decreaseLow: [
    "Трохи сором'язливості у прямому ефірі.",
    "Рулетка чхнула і збила показник.",
    "Мінус дрібний, але драматичний.",
  ],
  decreaseMedium: [
    "Холодна вода зробила свою справу.",
    "Статистика сьогодні з характером.",
    "Рулетка сказала: не цього разу.",
  ],
  decreaseHigh: [
    "Гравітація втрутилась без попередження.",
    "Це був болючий аудит сантиметрів.",
    "Результат пішов у режим економії.",
  ],
  zeroBlocked: [
    "Мінусувати повітря заборонено.",
    "Нуль тримає оборону.",
    "Бот спробував, але математика сказала ні.",
  ],
};

export function pickFunMeterJoke(
  jokes: FunMeterJokeBuckets,
  direction: FunMeterDirection,
  amount: number,
  zeroBlocked: boolean,
): string {
  if (zeroBlocked) {
    return pickRandom(jokes.zeroBlocked);
  }

  if (direction === "increase") {
    if (amount <= 5) {
      return pickRandom(jokes.increaseLow);
    }

    if (amount <= 12) {
      return pickRandom(jokes.increaseMedium);
    }

    return pickRandom(jokes.increaseHigh);
  }

  if (amount <= 5) {
    return pickRandom(jokes.decreaseLow);
  }

  if (amount <= 12) {
    return pickRandom(jokes.decreaseMedium);
  }

  return pickRandom(jokes.decreaseHigh);
}

export function normalizeFunMeterJokes(value: unknown): FunMeterJokeBuckets {
  if (!isRecord(value)) {
    return defaultFunMeterJokes;
  }

  return {
    increaseLow: normalizeJokeArray(value.increaseLow, defaultFunMeterJokes.increaseLow),
    increaseMedium: normalizeJokeArray(value.increaseMedium, defaultFunMeterJokes.increaseMedium),
    increaseHigh: normalizeJokeArray(value.increaseHigh, defaultFunMeterJokes.increaseHigh),
    decreaseLow: normalizeJokeArray(value.decreaseLow, defaultFunMeterJokes.decreaseLow),
    decreaseMedium: normalizeJokeArray(value.decreaseMedium, defaultFunMeterJokes.decreaseMedium),
    decreaseHigh: normalizeJokeArray(value.decreaseHigh, defaultFunMeterJokes.decreaseHigh),
    zeroBlocked: normalizeJokeArray(value.zeroBlocked, defaultFunMeterJokes.zeroBlocked),
  };
}

function pickRandom(items: readonly string[]): string {
  return items[Math.floor(Math.random() * items.length)] ?? items[0] ?? "";
}

function normalizeJokeArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
