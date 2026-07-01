import { logger } from "../../../core/logger/logger.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import { ChannelPointsRedemptionQueue } from "../queue/ChannelPointsRedemptionQueue.js";
import {
  rewardHistoryStore,
  type RewardHistoryItemStatus,
} from "../rewards/RewardHistoryStore.js";
import { rewardQueueStore } from "../rewards/RewardQueueStore.js";
import { RewardActionPayloadBuilder } from "../rewards/RewardActionPayloadBuilder.js";
import type { RewardActionDispatcher } from "../rewards/reward-dispatch.types.js";
import { RewardMappingService } from "../rewards/RewardMappingService.js";
import type { RewardMappingTargetTransport } from "../rewards/reward-mapping.types.js";
import type { TwitchRewardRedemptionEvent } from "../twitch.types.js";

function buildPayloadSummary(payload: Record<string, unknown>): string {
  const parts: string[] = [];

  const eventName = typeof payload.eventName === "string" ? payload.eventName : null;
  if (eventName) {
    parts.push(`event=${eventName}`);
  }

  const reward = payload.reward;
  if (reward && typeof reward === "object" && "cost" in reward) {
    const cost = reward.cost;
    if (typeof cost === "number") {
      parts.push(`cost=${cost}`);
    }
  }

  const redemption = payload.redemption;
  if (redemption && typeof redemption === "object" && "userInput" in redemption) {
    const userInput = redemption.userInput;
    if (typeof userInput === "string" && userInput.trim()) {
      parts.push(`input=${userInput.trim().slice(0, 60)}`);
    }
  }

  return parts.join(" | ") || "payload ready";
}

function normalizeTargetTransports(
  transports: string[] | null | undefined,
): RewardMappingTargetTransport[] {
  const normalized = new Set<RewardMappingTargetTransport>();

  for (const transport of transports ?? []) {
    if (transport === "unreal" || transport === "unity") {
      normalized.add(transport);
    }
  }

  return normalized.size > 0 ? [...normalized] : ["unreal"];
}

export class RewardRedemptionHandler {
  private readonly queue: ChannelPointsRedemptionQueue;

  constructor(
    private readonly rewardMappingService: RewardMappingService,
    private readonly payloadBuilder: RewardActionPayloadBuilder,
    private readonly dispatcher: RewardActionDispatcher,
  ) {
    this.queue = new ChannelPointsRedemptionQueue(
      async (event) => this.processRedemption(event),
    );
  }

  async handle(
    event: TwitchRewardRedemptionEvent,
    options?: { waitForProcessing?: boolean },
  ) {
    logger.info("Channel points redemption received", {
      user: event.user_login,
      rewardTitle: event.reward.title,
      userInput: event.user_input,
      redemptionId: event.id,
    });

    twitchEventLog.add({
      source: "rewards",
      type: "reward.redemption_received",
      message: "Channel points redemption received",
      data: {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        userId: event.user_id,
        userLogin: event.user_login,
        userName: event.user_name,
        userInput: event.user_input || null,
        redeemedAt: event.redeemed_at,
      },
    });

    rewardQueueStore.enqueue({
      redemptionId: event.id,
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      userId: event.user_id,
      userLogin: event.user_login,
      userName: event.user_name,
    });

    const completion = this.queue.enqueue(event);

    if (options?.waitForProcessing) {
      await completion;
    }
  }

  getQueueStatus() {
    return this.queue.getStatus();
  }

  private async processRedemption(event: TwitchRewardRedemptionEvent) {
    rewardQueueStore.markProcessing(event.id);

    logger.info("Executing channel points redemption", {
      redemptionId: event.id,
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      userId: event.user_id,
      userLogin: event.user_login,
      redeemedAt: event.redeemed_at,
    });

    const mapping = await this.rewardMappingService.getByRewardId(event.reward.id);

    if (!mapping) {
      logger.warn("No reward mapping found for redemption", {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        userId: event.user_id,
        userLogin: event.user_login,
      });

      twitchEventLog.add({
        level: "warn",
        source: "rewards",
        type: "reward.mapping_missing",
        message: "No reward mapping found for redemption",
        data: {
          redemptionId: event.id,
          rewardId: event.reward.id,
          rewardTitle: event.reward.title,
          userId: event.user_id,
          userLogin: event.user_login,
          userName: event.user_name,
        },
      });

      this.finishReward(event, "missing_mapping");
      return;
    }

    const targetTransports = normalizeTargetTransports(mapping.targetTransports);

    if (!mapping.enabled) {
      logger.warn("Reward mapping is disabled", {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
      });

      twitchEventLog.add({
        level: "warn",
        source: "rewards",
        type: "reward.mapping_disabled",
        message: "Reward mapping is disabled",
        data: {
          redemptionId: event.id,
          rewardId: event.reward.id,
          rewardTitle: event.reward.title,
          mappingId: mapping.id,
          unrealEventName: mapping.unrealEventName,
          unityEventName: mapping.unityEventName,
          targetTransports,
        },
      });

      this.finishReward(event, "disabled", {
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
      });
      return;
    }

    const payload = this.payloadBuilder.build(
      {
        id: mapping.id,
        rewardId: mapping.rewardId,
        rewardTitle: mapping.rewardTitle,
        enabled: mapping.enabled,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        payloadTemplate: mapping.payloadTemplate,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      },
      event,
    );

    const payloadSummary = buildPayloadSummary(payload.resolvedPayload);

    logger.info("Reward mapping matched for redemption", {
      redemptionId: event.id,
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      mappingId: mapping.id,
      unrealEventName: mapping.unrealEventName,
      unityEventName: mapping.unityEventName,
      targetTransports,
    });

    twitchEventLog.add({
      source: "rewards",
      type: "reward.mapping_matched",
      message: "Reward mapping matched and payload was built",
      data: {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        payloadSummary,
        payload: payload.resolvedPayload,
      },
    });

    twitchEventLog.add({
      source: "rewards",
      type: "reward.dispatch_started",
      message: "Reward dispatch started",
      data: {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        payloadSummary,
      },
    });

    try {
      const dispatchResult = await this.dispatcher.dispatch({
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        payload,
        event,
      });

      twitchEventLog.add({
        source: "rewards",
        type: "reward.dispatch_succeeded",
        message: "Reward dispatch finished successfully",
        data: {
          redemptionId: event.id,
          rewardId: event.reward.id,
          rewardTitle: event.reward.title,
          mappingId: mapping.id,
          unrealEventName: mapping.unrealEventName,
          unityEventName: mapping.unityEventName,
          targetTransports,
          payloadSummary,
          transport: dispatchResult.transport,
          dispatchedAt: dispatchResult.dispatchedAt,
        },
      });

      this.finishReward(event, "processed", {
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        payloadSummary,
        dispatchedPayload: payload.resolvedPayload,
      });
    } catch (error) {
      logger.error("Failed to execute reward redemption", {
        redemptionId: event.id,
        rewardId: event.reward.id,
        rewardTitle: event.reward.title,
        userId: event.user_id,
        userLogin: event.user_login,
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        error,
      });

      twitchEventLog.add({
        level: "error",
        source: "rewards",
        type: "reward.dispatch_failed",
        message: "Failed to dispatch reward action",
        data: {
          redemptionId: event.id,
          rewardId: event.reward.id,
          rewardTitle: event.reward.title,
          userId: event.user_id,
          userLogin: event.user_login,
          userName: event.user_name,
          mappingId: mapping.id,
          unrealEventName: mapping.unrealEventName,
          unityEventName: mapping.unityEventName,
          targetTransports,
          payloadSummary,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      this.finishReward(event, "failed", {
        mappingId: mapping.id,
        unrealEventName: mapping.unrealEventName,
        unityEventName: mapping.unityEventName,
        targetTransports,
        payloadSummary,
      });
      throw error;
    }
  }

  private finishReward(
    event: TwitchRewardRedemptionEvent,
    status: RewardHistoryItemStatus,
    extra?: {
      mappingId?: string | null;
      unrealEventName?: string | null;
      unityEventName?: string | null;
      targetTransports?: string[] | null;
      payloadSummary?: string | null;
      dispatchedPayload?: Record<string, unknown> | null;
    },
  ) {
    rewardQueueStore.remove(event.id);

    rewardHistoryStore.add({
      redemptionId: event.id,
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      userId: event.user_id,
      userLogin: event.user_login,
      userName: event.user_name,
      status,
      mappingId: extra?.mappingId ?? null,
      unrealEventName: extra?.unrealEventName ?? null,
      unityEventName: extra?.unityEventName ?? null,
      targetTransports: extra?.targetTransports ?? null,
      payloadSummary: extra?.payloadSummary ?? null,
      dispatchedPayload: extra?.dispatchedPayload ?? null,
    });
  }
}

