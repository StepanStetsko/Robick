import crypto from "node:crypto";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";

export type TwitchEventLogLevel = "info" | "warn" | "error";
export type TwitchEventLogSource =
  | "runtime"
  | "admin"
  | "chat"
  | "rewards"
  | "queue"
  | "system";

export type TwitchEventLogEntry = {
  id: string;
  timestamp: string;
  level: TwitchEventLogLevel;
  source: TwitchEventLogSource;
  type: string;
  message: string;
  data: Record<string, unknown> | null;
};

type LogInput = {
  level?: TwitchEventLogLevel;
  source: TwitchEventLogSource;
  type: string;
  message: string;
  data?: Record<string, unknown> | null;
};

class TwitchEventLogService {
  private readonly entries: TwitchEventLogEntry[] = [];
  private readonly maxEntries = 500;

  list(limit = 100): TwitchEventLogEntry[] {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.floor(limit)))
      : 100;

    return this.entries.slice(0, normalizedLimit);
  }

  add(input: LogInput): TwitchEventLogEntry {
    const entry: TwitchEventLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: input.level ?? "info",
      source: input.source,
      type: input.type,
      message: input.message,
      data: input.data ?? null,
    };

    this.entries.unshift(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    twitchRealtimeHub.publish("event.appended", entry);

    return entry;
  }

  clear() {
    this.entries.length = 0;
    twitchRealtimeHub.publish("event.cleared", { cleared: true });
  }
}

export const twitchEventLog = new TwitchEventLogService();