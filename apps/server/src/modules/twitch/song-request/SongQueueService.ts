import type { SongRequest } from "../../../generated/prisma/client.js";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";
import {
  SongRequestRepository,
  type CreateSongRequestInput,
} from "./SongRequestRepository.js";
import {
  canonicalYouTubeUrl,
  fetchYouTubeOEmbed,
  parseYouTubeVideoId,
} from "./youtube.js";
import {
  normalizeCommandName,
  normalizeSongRequestMessages,
  type OverlayState,
  type SongQueueState,
  type SongRequestDto,
  type SongRequestSettingsDto,
  type UpdateSongRequestSettingsInput,
} from "./song-request.types.js";

const SETTINGS_TTL_MS = 30_000;

export type EnqueueInput = {
  url: string;
  requestedBy: string;
  requesterId: string | null;
  source: "chat" | "site" | "donation";
  priority?: number;
};

export type EnqueueResult =
  | { ok: true; entry: SongRequestDto; position: number }
  | {
      ok: false;
      reason: "disabled" | "invalidUrl" | "queueFull" | "cooldown" | "duplicate";
      secondsLeft?: number;
    };

export class SongQueueService {
  private settingsCache: { value: SongRequestSettingsDto; at: number } | null =
    null;
  // Playback controls (in-memory; the overlay reads them via getOverlayState).
  private paused = false;
  private skipVoters = new Set<string>();
  private votedSongId: string | null = null;

  constructor(private readonly repo: SongRequestRepository) {}

  async getSettings(): Promise<SongRequestSettingsDto> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.value;
    }

    const row = await this.repo.getSettingsRow();
    const value: SongRequestSettingsDto = {
      command: row.command,
      enabled: row.enabled,
      maxQueuePerUser: row.maxQueuePerUser,
      maxDurationSec: row.maxDurationSec,
      perUserCooldownSec: row.perUserCooldownSec,
      voteSkipCommand: row.voteSkipCommand,
      pauseCommand: row.pauseCommand,
      skipVotesNeeded: row.skipVotesNeeded,
      messages: normalizeSongRequestMessages(row.messages),
      updatedAt: row.updatedAt.toISOString(),
    };

    this.settingsCache = { value, at: now };
    return value;
  }

  async updateSettings(
    input: UpdateSongRequestSettingsInput,
  ): Promise<SongRequestSettingsDto> {
    const normalized: UpdateSongRequestSettingsInput = {
      ...input,
      ...(input.command !== undefined
        ? { command: normalizeCommandName(input.command, "пісня") }
        : {}),
      ...(input.voteSkipCommand !== undefined
        ? { voteSkipCommand: normalizeCommandName(input.voteSkipCommand, "скіп") }
        : {}),
      ...(input.pauseCommand !== undefined
        ? { pauseCommand: normalizeCommandName(input.pauseCommand, "пауза") }
        : {}),
      ...(input.skipVotesNeeded !== undefined
        ? { skipVotesNeeded: Math.max(1, Math.round(input.skipVotesNeeded)) }
        : {}),
    };

    await this.repo.updateSettings(normalized);
    this.settingsCache = null;
    return this.getSettings();
  }

  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const settings = await this.getSettings();

    if (!settings.enabled) {
      return { ok: false, reason: "disabled" };
    }

    const videoId = parseYouTubeVideoId(input.url);
    if (!videoId) {
      return { ok: false, reason: "invalidUrl" };
    }

    const duplicate = await this.repo.findActiveByVideoId(videoId);
    if (duplicate) {
      return { ok: false, reason: "duplicate" };
    }

    if (input.requesterId) {
      if (
        settings.maxQueuePerUser > 0 &&
        (await this.repo.countQueuedByRequester(input.requesterId)) >=
          settings.maxQueuePerUser
      ) {
        return { ok: false, reason: "queueFull" };
      }

      if (settings.perUserCooldownSec > 0) {
        const last = await this.repo.lastByRequester(input.requesterId);
        if (last) {
          const elapsedSec = (Date.now() - last.createdAt.getTime()) / 1000;
          if (elapsedSec < settings.perUserCooldownSec) {
            return {
              ok: false,
              reason: "cooldown",
              secondsLeft: Math.ceil(settings.perUserCooldownSec - elapsedSec),
            };
          }
        }
      }
    }

    const meta = await fetchYouTubeOEmbed(videoId);

    const data: CreateSongRequestInput = {
      videoId,
      url: canonicalYouTubeUrl(videoId),
      title: meta.title,
      durationSec: null,
      thumbnailUrl: meta.thumbnailUrl,
      requestedBy: input.requestedBy,
      requesterId: input.requesterId,
      source: input.source,
      priority: input.priority ?? 0,
    };

    const row = await this.repo.create(data);
    const state = await this.publishState();

    const position =
      state.queue.findIndex((entry) => entry.id === row.id) + 1 || state.queue.length;

    return { ok: true, entry: toDto(row), position };
  }

  async getQueueState(): Promise<SongQueueState> {
    const [playing, queued, settings] = await Promise.all([
      this.repo.getPlaying(),
      this.repo.listQueued(),
      this.getSettings(),
    ]);

    return {
      current: playing ? toDto(playing) : null,
      queue: queued.map(toDto),
      paused: this.paused,
      skipVotes: this.currentSkipVotes(playing?.id ?? null),
      skipVotesNeeded: settings.skipVotesNeeded,
    };
  }

  /** Overlay state: promote next if idle, plus playback controls. */
  async getOverlayState(): Promise<OverlayState> {
    const current = await this.ensureCurrent();
    const settings = await this.getSettings();
    return {
      current,
      paused: this.paused,
      skipVotes: this.currentSkipVotes(current?.id ?? null),
      skipVotesNeeded: settings.skipVotesNeeded,
    };
  }

  private currentSkipVotes(playingId: string | null): number {
    return playingId && this.votedSongId === playingId
      ? this.skipVoters.size
      : 0;
  }

  /** Clear per-song controls when the current track changes. */
  private resetControls(): void {
    this.paused = false;
    this.skipVoters.clear();
    this.votedSongId = null;
  }

  async togglePause(): Promise<SongQueueState> {
    this.paused = !this.paused;
    return this.publishState();
  }

  /**
   * A viewer votes to skip the current track. Returns the running tally; when
   * it reaches the configured threshold the track is skipped automatically.
   */
  async voteSkip(voterId: string): Promise<{
    reason: "ok" | "already" | "noCurrent";
    votes: number;
    needed: number;
    skipped: boolean;
  }> {
    const settings = await this.getSettings();
    const needed = settings.skipVotesNeeded;
    const playing = await this.repo.getPlaying();

    if (!playing) {
      return { reason: "noCurrent", votes: 0, needed, skipped: false };
    }

    if (this.votedSongId !== playing.id) {
      this.skipVoters.clear();
      this.votedSongId = playing.id;
    }

    if (this.skipVoters.has(voterId)) {
      return {
        reason: "already",
        votes: this.skipVoters.size,
        needed,
        skipped: false,
      };
    }

    this.skipVoters.add(voterId);
    const votes = this.skipVoters.size;

    if (votes >= needed) {
      await this.skipCurrent();
      return { reason: "ok", votes, needed, skipped: true };
    }

    await this.publishState();
    return { reason: "ok", votes, needed, skipped: false };
  }

  /** Overlay: return the current track, promoting the next one if idle. */
  async ensureCurrent(): Promise<SongRequestDto | null> {
    const playing = await this.repo.getPlaying();
    if (playing) {
      return toDto(playing);
    }

    const next = await this.repo.nextQueued();
    if (!next) {
      return null;
    }

    this.resetControls();
    await this.repo.setStatus(next.id, "playing");
    await this.publishState();
    return toDto(next);
  }

  /** Overlay: current track finished — mark it played and promote the next. */
  async advance(): Promise<SongQueueState> {
    const playing = await this.repo.getPlaying();
    if (playing) {
      await this.repo.setStatus(playing.id, "played", new Date());
    }

    this.resetControls();

    const next = await this.repo.nextQueued();
    if (next) {
      await this.repo.setStatus(next.id, "playing");
    }

    return this.publishState();
  }

  /** Admin/mod: skip the current track (marks it skipped, promotes next). */
  async skipCurrent(): Promise<SongQueueState> {
    const playing = await this.repo.getPlaying();
    if (playing) {
      await this.repo.setStatus(playing.id, "skipped", new Date());
    }

    this.resetControls();

    const next = await this.repo.nextQueued();
    if (next) {
      await this.repo.setStatus(next.id, "playing");
    }

    return this.publishState();
  }

  async remove(id: string): Promise<SongQueueState> {
    await this.repo.deleteById(id);
    return this.publishState();
  }

  async clear(): Promise<SongQueueState> {
    await this.repo.deleteActive();
    return this.publishState();
  }

  private async publishState(): Promise<SongQueueState> {
    const state = await this.getQueueState();
    twitchRealtimeHub.publish("song-queue.changed", state);
    return state;
  }
}

function toDto(row: SongRequest): SongRequestDto {
  return {
    id: row.id,
    videoId: row.videoId,
    url: row.url,
    title: row.title,
    durationSec: row.durationSec,
    thumbnailUrl: row.thumbnailUrl,
    requestedBy: row.requestedBy,
    requesterId: row.requesterId,
    source: row.source,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    playedAt: row.playedAt ? row.playedAt.toISOString() : null,
  };
}
