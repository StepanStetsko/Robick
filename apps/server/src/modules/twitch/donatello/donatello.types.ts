export const DONATELLO_SETTINGS_KEY = "donatello";

export type DonatelloMessages = {
  /** Posted to chat when a donation's song is queued (thankYouInChat on). */
  songAdded: string;
};

export type DonatelloSettingsDto = {
  enabled: boolean;
  songMinAmount: number;
  songPriority: number;
  currency: string;
  thankYouInChat: boolean;
  messages: DonatelloMessages;
  updatedAt: string;
};

export type UpdateDonatelloSettingsInput = Partial<
  Omit<DonatelloSettingsDto, "updatedAt">
>;

export type DonatelloDonationDto = {
  id: string;
  pubId: string;
  clientName: string | null;
  amount: number | null;
  currency: string | null;
  message: string | null;
  songRequestId: string | null;
  songTitle: string | null;
  outcome: string;
  createdAt: string;
};

/**
 * The «Колбеки» webhook body Donatello POSTs to us. Every field is optional /
 * unknown-shaped because it comes from an external service — we validate before
 * use. `amount` and `createdAt` arrive as strings.
 */
export type DonatelloCallbackBody = {
  pubId?: unknown;
  clientName?: unknown;
  message?: unknown;
  amount?: unknown;
  currency?: unknown;
  actualAmount?: unknown;
  actualCurrency?: unknown;
  isSubscription?: unknown;
  createdAt?: unknown;
};

export const defaultDonatelloMessages: DonatelloMessages = {
  songAdded:
    "🎵 Дякую за донат, {clientName}! Пісню додано в чергу з пріоритетом: {title} (позиція {position}).",
};

export function normalizeDonatelloMessages(value: unknown): DonatelloMessages {
  if (!isRecord(value)) {
    return defaultDonatelloMessages;
  }

  return {
    songAdded: normalizeTemplate(
      value.songAdded,
      defaultDonatelloMessages.songAdded,
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
