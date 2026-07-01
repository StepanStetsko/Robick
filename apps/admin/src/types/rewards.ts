export type RewardMapping = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  enabled: boolean;
  unrealEventName?: string | null;
  unityEventName?: string | null;
  targetTransports?: RewardMappingTargetTransport[];
  payloadTemplate: unknown | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RewardMappingTargetTransport = "unreal" | "unity";

export type TwitchRewardCatalogItem = {
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  prompt: string;
  backgroundColor: string | null;
  isEnabled: boolean;
  isPaused: boolean;
  isInStock: boolean;
  cooldownExpiresAt: string | null;
  mapping: RewardMapping | null;
};

export type RewardCatalog = {
  mapped: TwitchRewardCatalogItem[];
  unmapped: TwitchRewardCatalogItem[];
};

export type CreateRewardMappingDto = {
  rewardId: string;
  rewardTitle: string;
  enabled: boolean;
  unrealEventName?: string | null;
  unityEventName?: string | null;
  targetTransports?: RewardMappingTargetTransport[];
  payloadTemplate?: unknown | null;
};

export type UpdateRewardMappingDto = Partial<CreateRewardMappingDto>;
