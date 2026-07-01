import { http } from "./http";
import type { PresenceLog } from "../types/presence";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getPresenceLog(): Promise<PresenceLog> {
  const result = await http<ApiResponse<PresenceLog>>(
    "/api/twitch/presence/log",
    { method: "GET" },
  );

  return result.data;
}

export async function refreshPresenceLog(): Promise<PresenceLog> {
  const result = await http<ApiResponse<PresenceLog>>(
    "/api/twitch/presence/refresh",
    { method: "POST" },
  );

  return result.data;
}
