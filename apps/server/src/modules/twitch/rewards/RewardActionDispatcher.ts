import { logger } from "../../../core/logger/logger.js";
import type { UnityWebSocketServer } from "../../unity/UnityWebSocketServer.js";
import type { UnityRewardDispatchMessage } from "../../unity/unity-dispatch.types.js";
import type { UnrealWebSocketServer } from "../../unreal/UnrealWebSocketServer.js";
import type { UnrealRewardDispatchMessage } from "../../unreal/unreal-dispatch.types.js";
import { twitchEventLog } from "../events/twitch-event-log.js";
import type {
  RewardActionDispatcher,
  RewardDispatchContext,
  RewardDispatchResult,
} from "./reward-dispatch.types.js";

export class LocalLogRewardDispatcher implements RewardActionDispatcher {
  async dispatch(context: RewardDispatchContext): Promise<RewardDispatchResult> {
    logger.info("Local reward dispatch executed", {
      mappingId: context.mappingId,
      unrealEventName: context.unrealEventName,
      unityEventName: context.unityEventName,
      targetTransports: context.targetTransports,
      payload: context.payload.resolvedPayload,
      redemptionId: context.payload.redemptionId,
    });

    return {
      ok: true,
      transport: "local_log",
      dispatchedAt: new Date().toISOString(),
    };
  }
}

export class UnrealWebSocketRewardDispatcher implements RewardActionDispatcher {
  constructor(private readonly unrealWebSocketServer: UnrealWebSocketServer) {}

  async dispatch(context: RewardDispatchContext): Promise<RewardDispatchResult> {
    if (!context.targetTransports.includes("unreal")) {
      return {
        ok: true,
        transport: "unreal_websocket",
        dispatchedAt: new Date().toISOString(),
        skipped: true,
      };
    }

    if (!context.unrealEventName) {
      throw new Error("unrealEventName is required for Unreal reward dispatch");
    }

    const message: UnrealRewardDispatchMessage = {
      type: "reward_dispatch",
      eventId: context.payload.redemptionId,
      redemptionId: context.payload.redemptionId,
      broadcasterId: context.event.broadcaster_user_id,
      broadcasterLogin: context.event.broadcaster_user_login,
      broadcasterDisplayName: context.event.broadcaster_user_name,
      userInput: context.event.user_input ?? "",
      user: {
        id: context.event.user_id,
        login: context.event.user_login,
        displayName: context.event.user_name,
      },
      reward: {
        rewardId: context.event.reward.id,
        rewardTitle: context.event.reward.title,
        rewardPrompt: context.event.reward.prompt ?? "",
        cost: context.event.reward.cost,
      },
      mapping: {
        mappingId: context.mappingId,
        unrealEventName: context.unrealEventName,
      },
      payload: context.payload.resolvedPayload,
    };

    this.unrealWebSocketServer.broadcastRewardDispatch(message);

    logger.info("Reward dispatched to Unreal WebSocket transport", {
      eventId: message.eventId,
      redemptionId: message.redemptionId,
      unrealEventName: message.mapping.unrealEventName,
    });

    return {
      ok: true,
      transport: "unreal_websocket",
      dispatchedAt: new Date().toISOString(),
    };
  }
}

export class UnityWebSocketRewardDispatcher implements RewardActionDispatcher {
  constructor(private readonly unityWebSocketServer: UnityWebSocketServer) {}

  async dispatch(context: RewardDispatchContext): Promise<RewardDispatchResult> {
    const unityEventName = context.unityEventName ?? context.unrealEventName;

    if (!context.targetTransports.includes("unity")) {
      twitchEventLog.add({
        source: "rewards",
        type: "reward.dispatch_unity_skipped",
        message: "Reward Unity dispatch skipped",
        data: {
          redemptionId: context.payload.redemptionId,
          rewardId: context.payload.rewardId,
          rewardTitle: context.payload.rewardTitle,
          mappingId: context.mappingId,
          unityEventName,
          unrealEventName: context.unrealEventName ?? null,
          targetTransports: context.targetTransports,
          reason: "unity_not_targeted",
        },
      });

      return {
        ok: true,
        transport: "unity_websocket",
        dispatchedAt: new Date().toISOString(),
        skipped: true,
      };
    }

    twitchEventLog.add({
      source: "rewards",
      type: "reward.dispatch_unity_started",
      message: "Reward Unity dispatch started",
      data: {
        redemptionId: context.payload.redemptionId,
        rewardId: context.payload.rewardId,
        rewardTitle: context.payload.rewardTitle,
        mappingId: context.mappingId,
        unityEventName,
        unrealEventName: context.unrealEventName ?? null,
        targetTransports: context.targetTransports,
      },
    });

    if (!unityEventName) {
      throw new Error("unityEventName is required for Unity reward dispatch");
    }

    const unityPayload = {
      ...context.payload.resolvedPayload,
      eventName: unityEventName,
      mapping: {
        id: context.mappingId,
        unrealEventName: context.unrealEventName ?? null,
        unityEventName,
        targetTransports: context.targetTransports,
      },
    };

    const message: UnityRewardDispatchMessage = {
      type: "reward_dispatch",
      transport: "unity",
      eventId: context.payload.redemptionId,
      redemptionId: context.payload.redemptionId,
      broadcasterId: context.event.broadcaster_user_id,
      broadcasterLogin: context.event.broadcaster_user_login,
      broadcasterDisplayName: context.event.broadcaster_user_name,
      userInput: context.event.user_input ?? "",
      eventName: unityEventName,
      user: {
        id: context.event.user_id,
        login: context.event.user_login,
        displayName: context.event.user_name,
      },
      reward: {
        rewardId: context.event.reward.id,
        rewardTitle: context.event.reward.title,
        rewardPrompt: context.event.reward.prompt ?? "",
        cost: context.event.reward.cost,
      },
      mapping: {
        mappingId: context.mappingId,
        unityEventName,
        unrealEventName: context.unrealEventName ?? "",
        targetTransports: context.targetTransports,
      },
      payload: unityPayload,
    };

    try {
      const deliveredCount = this.unityWebSocketServer.broadcastRewardDispatch(message);

      logger.info("Reward dispatched to Unity WebSocket transport", {
        eventId: message.eventId,
        redemptionId: message.redemptionId,
        unityEventName: message.mapping.unityEventName,
        deliveredCount,
      });

      twitchEventLog.add({
        source: "rewards",
        type: "reward.dispatch_unity_succeeded",
        message: "Reward Unity dispatch succeeded",
        data: {
          redemptionId: message.redemptionId,
          rewardId: context.payload.rewardId,
          rewardTitle: context.payload.rewardTitle,
          mappingId: context.mappingId,
          unityEventName: message.mapping.unityEventName,
          unrealEventName: message.mapping.unrealEventName,
          targetTransports: message.mapping.targetTransports,
          deliveredCount,
        },
      });

      return {
        ok: true,
        transport: "unity_websocket",
        dispatchedAt: new Date().toISOString(),
      };
    } catch (error) {
      twitchEventLog.add({
        level: "error",
        source: "rewards",
        type: "reward.dispatch_unity_failed",
        message: "Reward Unity dispatch failed",
        data: {
          redemptionId: context.payload.redemptionId,
          rewardId: context.payload.rewardId,
          rewardTitle: context.payload.rewardTitle,
          mappingId: context.mappingId,
          unityEventName,
          unrealEventName: context.unrealEventName ?? null,
          targetTransports: context.targetTransports,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }
}


