import { env } from "../../../config/env.js";
import { logger } from "../../../core/logger/logger.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { SongQueueService } from "../song-request/SongQueueService.js";
import type { SupporterService } from "../supporter/SupporterService.js";
import { extractFirstYouTubeUrl } from "../song-request/youtube.js";
import { DonatelloRepository } from "./DonatelloRepository.js";
import {
  normalizeDonatelloMessages,
  type DonatelloCallbackBody,
  type DonatelloDonationDto,
  type DonatelloSettingsDto,
  type DonatelloSubscriberDto,
  type UpdateDonatelloSettingsInput,
} from "./donatello.types.js";
import type {
  DonatelloDonation,
  DonatelloSettings,
  DonatelloSubscriber,
} from "../../../generated/prisma/client.js";

const DONATELLO_API_BASE = "https://donatello.to/api/v1";
// Supporter grant window per sync — long enough to survive brief downtime, and
// refreshed every sync (~10 min) while the subscription stays active.
const SUPPORTER_GRANT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    private readonly supporterService: SupporterService,
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

  // ----- Subscribers (REST sync via X-Token) -----

  hasApiToken(): boolean {
    return Boolean(env.DONATELLO_API_TOKEN);
  }

  async listSubscribers(): Promise<DonatelloSubscriberDto[]> {
    const rows = await this.repo.listSubscribers();
    return rows.map(toSubscriberDto);
  }

  /**
   * Pull active subscribers from Donatello (GET /subscribers?isActive=true,
   * paginated) and upsert them. Marks ones no longer returned as inactive.
   */
  async syncSubscribers(): Promise<{ ok: boolean; count: number; error?: string }> {
    const token = env.DONATELLO_API_TOKEN;
    if (!token) {
      return { ok: false, count: 0, error: "DONATELLO_API_TOKEN не заданий" };
    }

    try {
      const seen: string[] = [];
      let page = 0;
      const size = 50;
      // Cap pages defensively so a bad `pages` value can't loop forever.
      for (let guard = 0; guard < 50; guard += 1) {
        const res = await fetch(
          `${DONATELLO_API_BASE}/subscribers?isActive=true&page=${page}&size=${size}`,
          { headers: { "X-Token": token } },
        );
        if (!res.ok) {
          return {
            ok: false,
            count: seen.length,
            error: `Donatello ${res.status}`,
          };
        }

        const data = (await res.json()) as {
          subscribers?: unknown;
          pages?: number;
          last?: boolean;
        };
        const list = Array.isArray(data.subscribers) ? data.subscribers : [];

        for (const raw of list) {
          const sub = parseSubscriber(raw);
          if (!sub) {
            continue;
          }
          seen.push(sub.pubClientId);
          await this.repo.upsertSubscriber(sub);

          // Auto-grant the supporter tier by Twitch login (rolling window,
          // refreshed each sync; revoked below when a sub lapses).
          if (sub.twitchName) {
            await this.supporterService.grantMonoSupporter({
              login: sub.twitchName,
              monoSubId: sub.pubClientId,
              until: new Date(Date.now() + SUPPORTER_GRANT_WINDOW_MS),
              displayName: sub.clientName,
            });
          }
        }

        const pages = typeof data.pages === "number" ? data.pages : page + 1;
        if (data.last === true || page + 1 >= pages || list.length === 0) {
          break;
        }
        page += 1;
      }

      // Revoke supporter for subs that dropped out of the active list.
      const lapsed = await this.repo.listLapsed(seen);
      for (const row of lapsed) {
        if (row.twitchName) {
          await this.supporterService.revokeMonoSupporter(row.twitchName);
        }
      }
      await this.repo.deactivateMissing(seen);
      return { ok: true, count: seen.length };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "sync failed";
      logger.warn("Donatello subscribers sync failed", error);
      return { ok: false, count: 0, error: message };
    }
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

type ParsedSubscriber = {
  pubClientId: string;
  clientName: string | null;
  tierName: string | null;
  amount: number | null;
  currency: string | null;
  twitchName: string | null;
  subscriptionStatus: string | null;
  isActive: boolean;
  successPayments: number | null;
};

function parseSubscriber(raw: unknown): ParsedSubscriber | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const pubClientId = asString(r.pubClientId)?.trim();
  if (!pubClientId) {
    return null;
  }
  const successPayments = asNumber(r.successPayments);
  return {
    pubClientId,
    clientName: asString(r.clientName)?.trim() || null,
    tierName: asString(r.tierName)?.trim() || null,
    amount: asNumber(r.amount),
    currency: asString(r.currency)?.trim().toUpperCase() || null,
    twitchName: asString(r.twitchName)?.trim().toLowerCase() || null,
    subscriptionStatus: asString(r.subscriptionStatus)?.trim() || null,
    isActive: r.isActive !== false,
    successPayments:
      successPayments === null ? null : Math.round(successPayments),
  };
}

function toSubscriberDto(row: DonatelloSubscriber): DonatelloSubscriberDto {
  return {
    id: row.id,
    pubClientId: row.pubClientId,
    clientName: row.clientName,
    tierName: row.tierName,
    amount: row.amount,
    currency: row.currency,
    twitchName: row.twitchName,
    subscriptionStatus: row.subscriptionStatus,
    isActive: row.isActive,
    successPayments: row.successPayments,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
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
