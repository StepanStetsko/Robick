import type { AuthStatus } from "./auth";
import type { CustomCommand, CustomCommandUsageHistoryEntry } from "./commands";
import type {
  RewardHistoryItem,
  RewardQueueItem,
  RewardQueueStatus,
  TwitchEventLogEntry,
} from "./events";
import type { TwitchRuntimeStatus } from "./twitch";
import type { EngineCapabilities } from "./engine";
import type {
  FunMeterFeature,
  FunMeterRollResult,
  FunMeterViewerStat,
} from "./funMeter";
import type { SongQueueState } from "./songRequest";

export type TwitchRealtimeSnapshot = {
  runtime: TwitchRuntimeStatus;
  engineTransports?: TwitchEngineStatus;
  engineCapabilities?: EngineCapabilities;
  queue: RewardQueueStatus;
  events: TwitchEventLogEntry[];
  auth: AuthStatus;
  commands: CustomCommand[];
  commandHistory: CustomCommandUsageHistoryEntry[];
  rewardQueue: RewardQueueItem[];
  rewardHistory: RewardHistoryItem[];
};

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

export type TwitchRealtimeEventMap = {
  snapshot: TwitchRealtimeSnapshot;
  "runtime.status": TwitchRuntimeStatus;
  "event.appended": TwitchEventLogEntry;
  "event.cleared": { cleared: true };
  "queue.status": RewardQueueStatus;
  "auth.status": AuthStatus;
  "engine.status": TwitchEngineStatus;
  "engine.capabilities": EngineCapabilities;
  "commands.changed": CustomCommand[];
  "command.usage.appended": CustomCommandUsageHistoryEntry;
  "fun-meter.roll": FunMeterRollResult;
  "fun-meter.leaderboard.changed": {
    featureKey: string;
    leaderboard: FunMeterViewerStat[];
  };
  "fun-meter.features.changed": FunMeterFeature[];
  "reward.queue.updated": RewardQueueItem[];
  "reward.history.appended": RewardHistoryItem;
  "reward.history.updated": RewardHistoryItem[];
  "song-queue.changed": SongQueueState;
  ping: { timestamp: string };
};

