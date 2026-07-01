import { logger } from "../../../core/logger/logger.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";
import type { TwitchRewardRedemptionEvent } from "../twitch.types.js";

type QueueProcessor = (event: TwitchRewardRedemptionEvent) => Promise<void>;

type QueuedRedemption = {
  event: TwitchRewardRedemptionEvent;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export class ChannelPointsRedemptionQueue {
  private readonly items: QueuedRedemption[] = [];
  private isProcessing = false;

  constructor(private readonly processor: QueueProcessor) {}

  enqueue(event: TwitchRewardRedemptionEvent): Promise<void> {
    const completion = new Promise<void>((resolve, reject) => {
      this.items.push({ event, resolve, reject });
    });

    this.emitStatus();

    logger.info("Channel points redemption queued", {
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      userId: event.user_id,
      userLogin: event.user_login,
      queueLength: this.items.length,
    });

    twitchEventLog.add({
      source: "queue",
      type: "queue.enqueued",
      message: "Reward redemption added to queue",
      data: {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        userId: event.user_id,
        userLogin: event.user_login,
        queueSize: this.items.length,
      },
    });

    void this.processNext();

    return completion;
  }

  getSize(): number {
    return this.items.length;
  }

  getStatus() {
    return {
      size: this.items.length,
      processing: this.isProcessing,
    };
  }

  private emitStatus() {
    twitchRealtimeHub.publish("queue.status", this.getStatus());
  }

  private async processNext() {
    if (this.isProcessing) {
      return;
    }

    const nextQueueItem = this.items.shift();

    if (!nextQueueItem) {
      this.emitStatus();
      return;
    }

    const nextItem = nextQueueItem.event;
    this.isProcessing = true;
    this.emitStatus();

    try {
      logger.info("Processing queued channel points redemption", {
        rewardId: nextItem.reward.id,
        rewardTitle: nextItem.reward.title,
        userId: nextItem.user_id,
        userLogin: nextItem.user_login,
        queueLength: this.items.length,
      });

      twitchEventLog.add({
        source: "queue",
        type: "queue.processing_started",
        message: "Started processing reward redemption from queue",
        data: {
          redemptionId: nextItem.id,
          rewardId: nextItem.reward.id,
          rewardTitle: nextItem.reward.title,
          userId: nextItem.user_id,
          userLogin: nextItem.user_login,
          remainingQueueSize: this.items.length,
        },
      });

      await this.processor(nextItem);
      nextQueueItem.resolve();

      logger.info("Channel points redemption processed", {
        rewardId: nextItem.reward.id,
        rewardTitle: nextItem.reward.title,
        userId: nextItem.user_id,
        userLogin: nextItem.user_login,
        queueLength: this.items.length,
      });

      twitchEventLog.add({
        source: "queue",
        type: "queue.processing_finished",
        message: "Finished processing reward redemption from queue",
        data: {
          redemptionId: nextItem.id,
          rewardId: nextItem.reward.id,
          rewardTitle: nextItem.reward.title,
          userId: nextItem.user_id,
          userLogin: nextItem.user_login,
          remainingQueueSize: this.items.length,
        },
      });
    } catch (error) {
      nextQueueItem.reject(error);

      logger.error("Failed to process channel points redemption from queue", {
        rewardId: nextItem.reward.id,
        rewardTitle: nextItem.reward.title,
        userId: nextItem.user_id,
        userLogin: nextItem.user_login,
        error,
      });

      twitchEventLog.add({
        level: "error",
        source: "queue",
        type: "queue.processing_failed",
        message: "Failed to process reward redemption from queue",
        data: {
          redemptionId: nextItem.id,
          rewardId: nextItem.reward.id,
          rewardTitle: nextItem.reward.title,
          userId: nextItem.user_id,
          userLogin: nextItem.user_login,
          remainingQueueSize: this.items.length,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.isProcessing = false;
      this.emitStatus();

      if (this.items.length > 0) {
        void this.processNext();
      }
    }
  }
}
