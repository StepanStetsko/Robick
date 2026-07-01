import crypto from "node:crypto";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";

export type RewardHistoryItemStatus =
  | "processed"
  | "failed"
  | "missing_mapping"
  | "disabled";

export type RewardHistoryItem = {
  id: string;
  redemptionId: string;
  rewardId: string;
  rewardTitle: string;
  userId: string;
  userLogin: string;
  userName?: string;
  timestamp: string;
  status: RewardHistoryItemStatus;
  mappingId?: string | null;
  unrealEventName?: string | null;
  unityEventName?: string | null;
  targetTransports?: string[] | null;
  payloadSummary?: string | null;
  dispatchedPayload?: Record<string, unknown> | null;
};

export class RewardHistoryStore {
  private readonly entries: RewardHistoryItem[] = [];
  private readonly maxEntries = 200;

  list(limit = 50): RewardHistoryItem[] {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(this.maxEntries, Math.floor(limit)))
      : 50;

    return this.entries.slice(0, normalizedLimit);
  }

  add(
    input: Omit<RewardHistoryItem, "id" | "timestamp">,
  ): RewardHistoryItem {
    const entry: RewardHistoryItem = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };

    this.entries.unshift(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    twitchRealtimeHub.publish("reward.history.appended", entry);
    twitchRealtimeHub.publish("reward.history.updated", this.list());

    return entry;
  }

  clear() {
    this.entries.length = 0;
    twitchRealtimeHub.publish("reward.history.updated", this.list());
  }
}

export const rewardHistoryStore = new RewardHistoryStore();
