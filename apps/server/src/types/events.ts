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

export type RewardQueueStatus = {
  size: number;
  processing: boolean;
};

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
};