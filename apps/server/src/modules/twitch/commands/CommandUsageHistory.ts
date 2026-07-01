import crypto from "node:crypto";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";

export type CommandActionDispatchStatus = "skipped" | "dispatched" | "failed";

export type CommandUsageHistoryEntry = {
  id: string;
  timestamp: string;
  commandName: string;
  userId: string;
  userLogin: string;
  userName: string;
  responseText: string;
  replyMode: "reply" | "normal";
  status: "executed" | "failed" | "cooldown" | "disabled_or_missing";
  messageId: string;
  actionEnabled?: boolean;
  targetTransports?: string[];
  unityEventName?: string | null;
  unrealEventName?: string | null;
  actionDispatchStatus?: CommandActionDispatchStatus;
};

class CommandUsageHistoryService {
  private readonly entries: CommandUsageHistoryEntry[] = [];
  private readonly maxEntries = 200;

  list(limit = 50): CommandUsageHistoryEntry[] {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(this.maxEntries, Math.floor(limit)))
      : 50;

    return this.entries.slice(0, normalizedLimit);
  }

  add(
    input: Omit<CommandUsageHistoryEntry, "id" | "timestamp">,
  ): CommandUsageHistoryEntry {
    const entry: CommandUsageHistoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };

    this.entries.unshift(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    twitchRealtimeHub.publish("command.usage.appended", entry);

    return entry;
  }
}

export const commandUsageHistory = new CommandUsageHistoryService();
