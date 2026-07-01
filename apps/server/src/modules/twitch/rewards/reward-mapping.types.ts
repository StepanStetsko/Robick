export type RewardMappingDto = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  enabled: boolean;
  unrealEventName: string | null;
  unityEventName: string | null;
  targetTransports: RewardMappingTargetTransport[];
  payloadTemplate: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type RewardMappingTargetTransport = "unreal" | "unity";

export type CreateRewardMappingInput = {
  rewardId: string;
  rewardTitle: string;
  enabled?: boolean;
  unrealEventName?: string | null;
  unityEventName?: string | null;
  targetTransports?: RewardMappingTargetTransport[];
  payloadTemplate?: unknown | null;
};

export type UpdateRewardMappingInput = {
  rewardId?: string;
  rewardTitle?: string;
  enabled?: boolean;
  unrealEventName?: string | null;
  unityEventName?: string | null;
  targetTransports?: RewardMappingTargetTransport[];
  payloadTemplate?: unknown | null;
};
