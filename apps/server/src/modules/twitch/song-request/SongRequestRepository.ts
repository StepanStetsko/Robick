import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  PrismaClient,
  SongRequest,
  SongRequestSettings,
} from "../../../generated/prisma/client.js";
import {
  SONG_REQUEST_SETTINGS_KEY,
  defaultSongRequestMessages,
  type UpdateSongRequestSettingsInput,
} from "./song-request.types.js";

export type CreateSongRequestInput = {
  videoId: string;
  url: string;
  title: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  requestedBy: string;
  requesterId: string | null;
  source: string;
  priority: number;
};

export class SongRequestRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  // ----- Settings -----

  async getSettingsRow(): Promise<SongRequestSettings> {
    const existing = await this.db.songRequestSettings.findUnique({
      where: { key: SONG_REQUEST_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.songRequestSettings.create({
      data: {
        key: SONG_REQUEST_SETTINGS_KEY,
        messages:
          defaultSongRequestMessages as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(
    input: UpdateSongRequestSettingsInput,
  ): Promise<SongRequestSettings> {
    await this.getSettingsRow();

    return this.db.songRequestSettings.update({
      where: { key: SONG_REQUEST_SETTINGS_KEY },
      data: {
        ...(input.command !== undefined ? { command: input.command } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.maxQueuePerUser !== undefined
          ? { maxQueuePerUser: input.maxQueuePerUser }
          : {}),
        ...(input.maxDurationSec !== undefined
          ? { maxDurationSec: input.maxDurationSec }
          : {}),
        ...(input.perUserCooldownSec !== undefined
          ? { perUserCooldownSec: input.perUserCooldownSec }
          : {}),
        ...(input.voteSkipCommand !== undefined
          ? { voteSkipCommand: input.voteSkipCommand }
          : {}),
        ...(input.pauseCommand !== undefined
          ? { pauseCommand: input.pauseCommand }
          : {}),
        ...(input.skipVotesNeeded !== undefined
          ? { skipVotesNeeded: input.skipVotesNeeded }
          : {}),
        ...(input.messages !== undefined
          ? { messages: input.messages as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  // ----- Queue -----

  async create(input: CreateSongRequestInput): Promise<SongRequest> {
    return this.db.songRequest.create({ data: input });
  }

  /** Items waiting to play, donation/priority first then FIFO. */
  async listQueued(): Promise<SongRequest[]> {
    return this.db.songRequest.findMany({
      where: { status: "queued" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async getPlaying(): Promise<SongRequest | null> {
    return this.db.songRequest.findFirst({ where: { status: "playing" } });
  }

  async nextQueued(): Promise<SongRequest | null> {
    return this.db.songRequest.findFirst({
      where: { status: "queued" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async countQueuedByRequester(requesterId: string): Promise<number> {
    return this.db.songRequest.count({
      where: { status: "queued", requesterId },
    });
  }

  async findActiveByVideoId(videoId: string): Promise<SongRequest | null> {
    return this.db.songRequest.findFirst({
      where: { videoId, status: { in: ["queued", "playing"] } },
    });
  }

  async lastByRequester(requesterId: string): Promise<SongRequest | null> {
    return this.db.songRequest.findFirst({
      where: { requesterId },
      orderBy: { createdAt: "desc" },
    });
  }

  async setStatus(
    id: string,
    status: string,
    playedAt?: Date,
  ): Promise<void> {
    await this.db.songRequest.update({
      where: { id },
      data: { status, ...(playedAt ? { playedAt } : {}) },
    });
  }

  /** Recently finished tracks (played or skipped), newest first. */
  async listHistory(limit = 20): Promise<SongRequest[]> {
    return this.db.songRequest.findMany({
      where: { status: { in: ["played", "skipped"] } },
      orderBy: { playedAt: "desc" },
      take: limit,
    });
  }

  /** The most recently finished track (for the "previous song" control). */
  async lastPlayed(): Promise<SongRequest | null> {
    return this.db.songRequest.findFirst({
      where: { status: { in: ["played", "skipped"] }, playedAt: { not: null } },
      orderBy: { playedAt: "desc" },
    });
  }

  /** Move a track back into the queue, clearing its played timestamp. */
  async requeue(id: string): Promise<void> {
    await this.db.songRequest.update({
      where: { id },
      data: { status: "queued", playedAt: null },
    });
  }

  /** Promote a track straight to playing, clearing its played timestamp. */
  async setPlaying(id: string): Promise<void> {
    await this.db.songRequest.update({
      where: { id },
      data: { status: "playing", playedAt: null },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.songRequest.deleteMany({ where: { id } });
  }

  /** Clear the active queue (queued + currently playing). */
  async deleteActive(): Promise<void> {
    await this.db.songRequest.deleteMany({
      where: { status: { in: ["queued", "playing"] } },
    });
  }
}
