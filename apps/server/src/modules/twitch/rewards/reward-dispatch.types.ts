import type { TwitchRewardRedemptionEvent } from "../twitch.types.js";
import type { RewardMappingTargetTransport } from "./reward-mapping.types.js";

export type RewardActionPayload = {
  eventName: string | null;
  redemptionId: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  userId: string;
  userLogin: string;
  userName: string;
  userInput: string | null;
  redeemedAt: string;
  mappingId: string;
  templatePayload: unknown | null;
  resolvedPayload: Record<string, unknown>;
};

export type RewardDispatchContext = {
  mappingId: string;
  unrealEventName: string | null;
  unityEventName: string | null;
  targetTransports: RewardMappingTargetTransport[];
  payload: RewardActionPayload;
  event: TwitchRewardRedemptionEvent;
};

export type RewardDispatchResult = {
  ok: true;
  transport: string;
  dispatchedAt: string;
  skipped?: boolean;
};

export interface RewardActionDispatcher {
  dispatch(context: RewardDispatchContext): Promise<RewardDispatchResult>;
}
