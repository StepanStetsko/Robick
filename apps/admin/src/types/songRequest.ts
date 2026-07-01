export type SongRequestMessages = {
  added: string;
  queueFull: string;
  cooldown: string;
  invalidUrl: string;
  disabled: string;
  duplicate: string;
  blocked: string;
  tooLong: string;
  voteProgress: string;
  voteAlready: string;
  voteSkipped: string;
  modSkipped: string;
  paused: string;
  resumed: string;
  nothingPlaying: string;
};

export type SongRequestSettings = {
  command: string;
  enabled: boolean;
  maxQueuePerUser: number;
  maxDurationSec: number;
  perUserCooldownSec: number;
  voteSkipCommand: string;
  pauseCommand: string;
  skipVotesNeeded: number;
  historyLimit: number;
  messages: SongRequestMessages;
  updatedAt: string;
};

export type UpdateSongRequestSettingsInput = Partial<
  Omit<SongRequestSettings, "updatedAt">
>;

export type SongBlockEntry = {
  id: string;
  videoId: string;
  url: string;
  title: string | null;
  addedBy: string | null;
  createdAt: string;
};

export type SongRequestEntry = {
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
  current: SongRequestEntry | null;
  queue: SongRequestEntry[];
  paused: boolean;
  skipVotes: number;
  skipVotesNeeded: number;
};
