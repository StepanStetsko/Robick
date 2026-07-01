import { http } from "./http";
import type { RewardQueueStatus, TwitchEventLogEntry } from "../types/events";

type EventListResponse = {
  ok: boolean;
  data: TwitchEventLogEntry[];
};

type QueueStatusResponse = {
  ok: boolean;
  data: RewardQueueStatus;
};

export async function getTwitchEvents(limit = 100): Promise<TwitchEventLogEntry[]> {
  const result = await http<EventListResponse>(`/api/twitch/events?limit=${limit}`, {
    method: "GET",
  });

  return Array.isArray(result.data) ? result.data : [];
}

export async function clearTwitchEvents(): Promise<void> {
  await http<void>("/api/twitch/events/clear", {
    method: "POST",
    body: JSON.stringify({}),
    parseJson: false,
  });
}

export async function getRewardQueueStatus(): Promise<RewardQueueStatus> {
  const result = await http<QueueStatusResponse>("/api/twitch/rewards/queue/status", {
    method: "GET",
  });

  return result.data;
}
