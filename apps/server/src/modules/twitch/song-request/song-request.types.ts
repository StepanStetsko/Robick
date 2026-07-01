export const SONG_REQUEST_SETTINGS_KEY = "song_request";

export type SongRequestMessages = {
  added: string;
  queueFull: string;
  cooldown: string;
  invalidUrl: string;
  disabled: string;
  duplicate: string;
  voteProgress: string;
  voteAlready: string;
  voteSkipped: string;
  modSkipped: string;
  paused: string;
  resumed: string;
  nothingPlaying: string;
};

export type SongRequestSettingsDto = {
  command: string;
  enabled: boolean;
  maxQueuePerUser: number;
  maxDurationSec: number;
  perUserCooldownSec: number;
  voteSkipCommand: string;
  pauseCommand: string;
  skipVotesNeeded: number;
  messages: SongRequestMessages;
  updatedAt: string;
};

export type UpdateSongRequestSettingsInput = Partial<
  Omit<SongRequestSettingsDto, "updatedAt">
>;

export type SongRequestDto = {
  id: string;
  videoId: string;
  url: string;
  title: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  requestedBy: string;
  requesterId: string | null;
  source: string;
  priority: number;
  status: string;
  createdAt: string;
  playedAt: string | null;
};

export type SongQueueState = {
  current: SongRequestDto | null;
  queue: SongRequestDto[];
  paused: boolean;
  skipVotes: number;
  skipVotesNeeded: number;
};

export type OverlayState = {
  current: SongRequestDto | null;
  paused: boolean;
  skipVotes: number;
  skipVotesNeeded: number;
};

export type SongRequestViewerInput = {
  twitchUserId: string;
  userLogin: string;
  displayName?: string | null;
};

export const defaultSongRequestMessages: SongRequestMessages = {
  added: "🎵 @{displayName}, додав у чергу: {title} (позиція {position}).",
  queueFull:
    "@{displayName}, у тебе вже максимум пісень у черзі ({max}). Зачекай, поки зіграють.",
  cooldown:
    "@{displayName}, зачекай {secondsLeft} с перед наступним замовленням.",
  invalidUrl:
    "@{displayName}, дай посилання на YouTube: !{command} <посилання>.",
  disabled: "@{displayName}, замовлення пісень зараз вимкнено.",
  duplicate: "@{displayName}, ця пісня вже в черзі.",
  voteProgress:
    "🗳️ @{displayName} за пропуск ({votes}/{needed}). Ще {left} — і пісня скіпнеться.",
  voteAlready: "@{displayName}, ти вже голосував за пропуск ({votes}/{needed}).",
  voteSkipped: "⏭️ Пісню пропущено голосуванням глядачів ({needed}/{needed})!",
  modSkipped: "⏭️ @{displayName} пропустив поточну пісню.",
  paused: "⏸️ @{displayName} поставив пісню на паузу.",
  resumed: "▶️ @{displayName} відновив відтворення.",
  nothingPlaying: "@{displayName}, зараз нічого не грає.",
};

export function normalizeSongRequestMessages(
  value: unknown,
): SongRequestMessages {
  if (!isRecord(value)) {
    return defaultSongRequestMessages;
  }

  return {
    added: normalizeTemplate(value.added, defaultSongRequestMessages.added),
    queueFull: normalizeTemplate(
      value.queueFull,
      defaultSongRequestMessages.queueFull,
    ),
    cooldown: normalizeTemplate(
      value.cooldown,
      defaultSongRequestMessages.cooldown,
    ),
    invalidUrl: normalizeTemplate(
      value.invalidUrl,
      defaultSongRequestMessages.invalidUrl,
    ),
    disabled: normalizeTemplate(
      value.disabled,
      defaultSongRequestMessages.disabled,
    ),
    duplicate: normalizeTemplate(
      value.duplicate,
      defaultSongRequestMessages.duplicate,
    ),
    voteProgress: normalizeTemplate(
      value.voteProgress,
      defaultSongRequestMessages.voteProgress,
    ),
    voteAlready: normalizeTemplate(
      value.voteAlready,
      defaultSongRequestMessages.voteAlready,
    ),
    voteSkipped: normalizeTemplate(
      value.voteSkipped,
      defaultSongRequestMessages.voteSkipped,
    ),
    modSkipped: normalizeTemplate(
      value.modSkipped,
      defaultSongRequestMessages.modSkipped,
    ),
    paused: normalizeTemplate(value.paused, defaultSongRequestMessages.paused),
    resumed: normalizeTemplate(
      value.resumed,
      defaultSongRequestMessages.resumed,
    ),
    nothingPlaying: normalizeTemplate(
      value.nothingPlaying,
      defaultSongRequestMessages.nothingPlaying,
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
