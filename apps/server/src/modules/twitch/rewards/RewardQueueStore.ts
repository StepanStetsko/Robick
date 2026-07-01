import crypto from "node:crypto";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";

export type RewardQueueItemStatus = "queued" | "processing";

export type RewardQueueItem = {
  id: string;
  redemptionId: string;
  rewardId: string;
  rewardTitle: string;
  userId: string;
  userLogin: string;
  userName?: string;
  queuedAt: string;
  status: RewardQueueItemStatus;
};

export class RewardQueueStore {
  private readonly items: RewardQueueItem[] = [];

  list(): RewardQueueItem[] {
    return [...this.items];
  }

  enqueue(
    input: Omit<RewardQueueItem, "id" | "queuedAt" | "status">,
  ): RewardQueueItem {
    const item: RewardQueueItem = {
      id: crypto.randomUUID(),
      queuedAt: new Date().toISOString(),
      status: "queued",
      ...input,
    };

    this.items.push(item);
    this.emitUpdated();

    return item;
  }

  markProcessing(redemptionId: string): RewardQueueItem | null {
    const item = this.items.find((entry) => entry.redemptionId === redemptionId);

    if (!item) {
      return null;
    }

    item.status = "processing";
    this.emitUpdated();

    return item;
  }

  remove(redemptionId: string): RewardQueueItem | null {
    const index = this.items.findIndex(
      (entry) => entry.redemptionId === redemptionId,
    );

    if (index === -1) {
      return null;
    }

    const [removed] = this.items.splice(index, 1);
    this.emitUpdated();

    return removed ?? null;
  }

  clear() {
    this.items.length = 0;
    this.emitUpdated();
  }

  private emitUpdated() {
    twitchRealtimeHub.publish("reward.queue.updated", this.list());
  }
}

export const rewardQueueStore = new RewardQueueStore();