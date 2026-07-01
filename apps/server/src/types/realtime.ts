import type { AuthStatus } from "./auth";
import type { CustomCommand, CustomCommandUsageHistoryEntry } from "./commands";
import type {
  RewardHistoryItem,
  RewardQueueItem,
  RewardQueueStatus,
  TwitchEventLogEntry,
} from "./events";
import type { TwitchRuntimeStatus } from "./twitch";

export type EngineTransportStatus = {
  started: boolean;
  clientsCount: number;
  port: number;
  host: string;
};

export type TwitchEngineStatus = {
  unreal: EngineTransportStatus;
  unity: EngineTransportStatus;
};

export type TwitchRealtimeSnapshot = {
  runtime: TwitchRuntimeStatus;
  engineTransports?: TwitchEngineStatus;
  queue: RewardQueueStatus;
  events: TwitchEventLogEntry[];
  auth: AuthStatus;
  commands: CustomCommand[];
  commandHistory: CustomCommandUsageHistoryEntry[];
  rewardQueue: RewardQueueItem[];
  rewardHistory: RewardHistoryItem[];
};

export type TwitchRealtimeEventMap = {
  snapshot: TwitchRealtimeSnapshot;
  "runtime.status": TwitchRuntimeStatus;
  "event.appended": TwitchEventLogEntry;
  "event.cleared": { cleared: true };
  "queue.status": RewardQueueStatus;
  "auth.status": AuthStatus;
  "engine.status": TwitchEngineStatus;
  "commands.changed": CustomCommand[];
  "command.usage.appended": CustomCommandUsageHistoryEntry;
  "reward.queue.updated": RewardQueueItem[];
  "reward.history.appended": RewardHistoryItem;
  "reward.history.updated": RewardHistoryItem[];
  ping: { timestamp: string };
};
