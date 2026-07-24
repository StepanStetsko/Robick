import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { SongQueueService } from "../song-request/SongQueueService.js";
import { extractFirstYouTubeUrl } from "../song-request/youtube.js";
import { DonatelloRepository } from "./DonatelloRepository.js";
import {
  normalizeDonatelloMessages,
  type DonatelloCallbackBody,
  type DonatelloDonationDto,
  type DonatelloSettingsDto,
  type UpdateDonatelloSettingsInput,
} from "./donatello.types.js";
import type {
  DonatelloDonation,
  DonatelloSettings,
} from "../../../generated/prisma/client.js";

const SETTINGS_TTL_MS = 30_000;

export type DonatelloCallbackResult = {
  /** How the callback was handled — surfaced to logs, not to the caller HTTP. */
  status:
    | "disabled"
    | "invalid"
    | "duplicate"
    | "belowMin"
    | "noLink"
    | "queued"
    | "rejected";
};

export class DonatelloService {
  private settingsCache: { value: DonatelloSettingsDto; at: number } | null =
    null;

  constructor(
    private readonly repo: DonatelloRepository,
    private readonly songQueueService: SongQueueService,
    private readonly chatService: TwitchChatService,
  ) {}

  async getSettings(): Promise<DonatelloSettingsDto> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.value;
    }

    const row = await this.repo.getSettingsRow();
    const value = toSettingsDto(row);
    this.settingsCache = { value, at: now };
    return value;
  }

  async updateSettings(
    input: UpdateDonatelloSettingsInput,
  ): Promise<DonatelloSettingsDto> {
    const normalized: UpdateDonatelloSettingsInput = {
      ...input,
      ...(input.songMinAmount !== undefined
        ? { songMinAmount: Math.max(0, Math.round(input.songMinAmount)) }
        : {}),
      ...(input.songPriority !== undefined
        ? { songPriority: Math.max(1, Math.round(input.songPriority)) }
        : {}),
      ...(input.currency !== undefined
        ? { currency: input.currency.trim().toUpperCase() }
        : {}),
    };

    await this.repo.updateSettings(normalized);
    this.settingsCache = null;
    return this.getSettings();
  }

  async listDonations(limit?: number): Promise<DonatelloDonationDto[]> {
    const rows = await this.repo.listDonations(limit);
    return rows.map(toDonationDto);
  }

  /**
   * Process one «Колбеки» webhook body: dedupe by pubId, check the threshold
   * and currency, pull a YouTube link from the donation message and enqueue it
   * with the configured priority (queue-jump). Records every donation with an
   * outcome for the admin panel. Never throws — the webhook must always 200.
   */
  async handleCallback(
    body: DonatelloCallbackBody,
  ): Promise<DonatelloCallbackResult> {
    const pubId = asString(body.pubId)?.trim();
    if (!pubId) {
      return { status: "invalid" };
    }

    // Dedupe — Donatello may retry the same callback.
    const existing = await this.repo.findDonationByPubId(pubId);
    if (existing) {
      return { status: "duplicate" };
    }

    const settings = await this.getSettings();
    if (!settings.enabled) {
      return { status: "disabled" };
    }

    const clientName = asString(body.clientName)?.trim() || null;
    const message = asString(body.message) ?? null;
    const currency = asString(body.currency)?.trim().toUpperCase() || null;
    const amount = asNumber(body.amount);

    const record = async (
      outcome: DonatelloCallbackResult["status"],
      songRequestId: string | null = null,
      songTitle: string | null = null,
    ): Promise<DonatelloCallbackResult> => {
      try {
        await this.repo.createDonation({
          pubId,
          clientName,
          amount,
          currency,
          message,
          songRequestId,
          songTitle,
          outcome,
        });
      } catch (error: unknown) {
        // Unique-constraint race on pubId → already handled as duplicate.
        logger.warn("Donatello donation record failed", error);
      }
      return { status: outcome };
    };

    // Currency filter (empty = any). A mismatch can't be compared to the
    // threshold, so it doesn't qualify for a song.
    const currencyOk =
      !settings.currency || (currency ?? "") === settings.currency;

    if (!currencyOk || amount === null || amount < settings.songMinAmount) {
      return record("belowMin");
    }

    const url = message ? extractFirstYouTubeUrl(message) : null;
    if (!url) {
      return record("noLink");
    }

    const result = await this.songQueueService.enqueue({
      url,
      requestedBy: clientName ?? "Донат",
      requesterId: null,
      source: "donation",
      priority: settings.songPriority,
    });

    if (!result.ok) {
      // Same rules as chat (duplicate/blocked/tooLong/disabled) — but donation
      // rejections stay silent in chat by design; the reason is logged here.
      logger.info(`Donatello song rejected (${result.reason})`, { pubId });
      return record("rejected");
    }

    const outcome = await record(
      "queued",
      result.entry.id,
      result.entry.title,
    );

    if (settings.thankYouInChat) {
      const text = this.render(settings.messages.songAdded, {
        clientName: clientName ?? "друже",
        title: result.entry.title ?? url,
        position: result.position,
        amount: amount ?? "",
        currency: currency ?? "",
      });
      try {
        await this.chatService.sendMessage(text);
      } catch (error: unknown) {
        // Bot may be offline — the song is queued regardless.
        logger.warn("Donatello thank-you message failed", error);
      }
    }

    return outcome;
  }

  private render(template: string, values: Record<string, unknown>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];
      return value === undefined || value === null ? match : String(value);
    });
  }
}

function toSettingsDto(row: DonatelloSettings): DonatelloSettingsDto {
  return {
    enabled: row.enabled,
    songMinAmount: row.songMinAmount,
    songPriority: row.songPriority,
    currency: row.currency,
    thankYouInChat: row.thankYouInChat,
    messages: normalizeDonatelloMessages(row.messages),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDonationDto(row: DonatelloDonation): DonatelloDonationDto {
  return {
    id: row.id,
    pubId: row.pubId,
    clientName: row.clientName,
    amount: row.amount,
    currency: row.currency,
    message: row.message,
    songRequestId: row.songRequestId,
    songTitle: row.songTitle,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
