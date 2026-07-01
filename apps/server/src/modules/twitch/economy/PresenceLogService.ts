import { logger } from "../../../core/logger/logger.js";
import type { PresenceLogRepository } from "./PresenceLogRepository.js";

export type PresenceLogEntry = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  presentNow: boolean;
  hasChatted: boolean;
  messageCount: number;
  lastChatAt: number | null;
};

type Chatter = {
  user_id: string;
  user_login: string;
  user_name: string;
};

/** Local-day key (YYYY-MM-DD) used to scope the log and trigger the reset. */
function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Milliseconds until the next local midnight (00:00). */
function msUntilNextMidnight(now = new Date()): number {
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return next.getTime() - now.getTime();
}

/**
 * Session log of viewers seen on the stream: who entered chat (from the Get
 * Chatters poll) and whether they have written anything. Used by the admin
 * presence page to spot lurkers (present but silent).
 *
 * In-memory cache backed by the ViewerPresence table: the log is persisted
 * (flushed on each poll), reloaded on runtime start so it survives process
 * restarts, and reset at local midnight (timer + lazy day-check) so each day
 * starts fresh.
 */
export class PresenceLogService {
  private readonly entries = new Map<string, PresenceLogEntry>();
  private updatedAt = 0;
  private currentDay = localDayKey();
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly repo: PresenceLogRepository) {}

  /**
   * Load today's persisted log into memory and (re)arm the midnight reset.
   * Called on runtime start instead of wiping — so a restart keeps the day's
   * log. Rows from previous days are dropped here.
   */
  async init(): Promise<void> {
    this.currentDay = localDayKey();

    try {
      await this.repo.deleteOtherDays(this.currentDay);
      const rows = await this.repo.listByDay(this.currentDay);

      this.entries.clear();
      this.updatedAt = 0;

      for (const row of rows) {
        this.entries.set(row.twitchUserId, {
          twitchUserId: row.twitchUserId,
          userLogin: row.userLogin,
          displayName: row.displayName,
          firstSeenAt: row.firstSeenAt.getTime(),
          lastSeenAt: row.lastSeenAt.getTime(),
          // Presence is unknown until the next poll confirms it.
          presentNow: false,
          hasChatted: row.hasChatted,
          messageCount: row.messageCount,
          lastChatAt: row.lastChatAt ? row.lastChatAt.getTime() : null,
        });
        this.updatedAt = Math.max(this.updatedAt, row.lastSeenAt.getTime());
      }
    } catch (error: unknown) {
      logger.error("Failed to load presence log from DB", error);
    }

    this.scheduleMidnightReset();
  }

  /** Replace the present-now snapshot with the latest Get Chatters poll. */
  recordPresent(chatters: Chatter[]): void {
    this.ensureCurrentDay();

    const now = Date.now();
    const presentIds = new Set(chatters.map((chatter) => chatter.user_id));

    for (const chatter of chatters) {
      const entry = this.entries.get(chatter.user_id);

      if (entry) {
        entry.userLogin = chatter.user_login;
        entry.displayName = chatter.user_name || chatter.user_login;
        entry.lastSeenAt = now;
        entry.presentNow = true;
      } else {
        this.entries.set(chatter.user_id, {
          twitchUserId: chatter.user_id,
          userLogin: chatter.user_login,
          displayName: chatter.user_name || chatter.user_login,
          firstSeenAt: now,
          lastSeenAt: now,
          presentNow: true,
          hasChatted: false,
          messageCount: 0,
          lastChatAt: null,
        });
      }
    }

    // Anyone not in this poll is no longer present.
    for (const entry of this.entries.values()) {
      if (!presentIds.has(entry.twitchUserId)) {
        entry.presentNow = false;
      }
    }

    this.updatedAt = now;

    // The poll (~every few minutes) is the natural persistence checkpoint.
    void this.flush();
  }

  /** Mark a viewer as having chatted (also implies they are present now). */
  recordChat(
    twitchUserId: string,
    userLogin: string,
    displayName: string,
  ): void {
    this.ensureCurrentDay();

    const now = Date.now();
    const entry = this.entries.get(twitchUserId);

    if (entry) {
      entry.userLogin = userLogin;
      entry.displayName = displayName || userLogin;
      entry.lastSeenAt = now;
      entry.presentNow = true;
      entry.hasChatted = true;
      entry.messageCount += 1;
      entry.lastChatAt = now;
    } else {
      this.entries.set(twitchUserId, {
        twitchUserId,
        userLogin,
        displayName: displayName || userLogin,
        firstSeenAt: now,
        lastSeenAt: now,
        presentNow: true,
        hasChatted: true,
        messageCount: 1,
        lastChatAt: now,
      });
    }

    this.updatedAt = now;
  }

  list(): PresenceLogEntry[] {
    this.ensureCurrentDay();
    return [...this.entries.values()];
  }

  get lastUpdatedAt(): number {
    return this.updatedAt;
  }

  /** Persist the current in-memory snapshot for today. */
  async flush(): Promise<void> {
    const day = this.currentDay;
    const entries = [...this.entries.values()];

    try {
      await this.repo.upsertMany(
        day,
        entries.map((entry) => ({
          twitchUserId: entry.twitchUserId,
          userLogin: entry.userLogin,
          displayName: entry.displayName,
          firstSeenAt: new Date(entry.firstSeenAt),
          lastSeenAt: new Date(entry.lastSeenAt),
          presentNow: entry.presentNow,
          hasChatted: entry.hasChatted,
          messageCount: entry.messageCount,
          lastChatAt: entry.lastChatAt ? new Date(entry.lastChatAt) : null,
        })),
      );
    } catch (error: unknown) {
      logger.error("Failed to persist presence log", error);
    }
  }

  /** If we've crossed local midnight, drop the previous day's log. */
  private ensureCurrentDay(): void {
    const today = localDayKey();
    if (today === this.currentDay) {
      return;
    }

    this.currentDay = today;
    this.entries.clear();
    this.updatedAt = 0;
    void this.repo.deleteOtherDays(today).catch((error: unknown) => {
      logger.error("Failed to clear previous-day presence log", error);
    });
  }

  private scheduleMidnightReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      void this.resetForNewDay();
    }, msUntilNextMidnight());
  }

  private async resetForNewDay(): Promise<void> {
    this.currentDay = localDayKey();
    this.entries.clear();
    this.updatedAt = 0;

    try {
      await this.repo.deleteAll();
    } catch (error: unknown) {
      logger.error("Failed to reset presence log at midnight", error);
    }

    this.scheduleMidnightReset();
  }
}
