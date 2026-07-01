import { http } from "./http";
import type { TwitchRuntimeStatus } from "../types/twitch";

type TwitchRuntimeStatusResponse = {
  ok: boolean;
  data: TwitchRuntimeStatus;
};

type SendChatMessageResponse = {
  ok: boolean;
  data: {
    sent: boolean;
    message: string;
  };
};

export async function getRuntimeStatus(): Promise<TwitchRuntimeStatus> {
  const result = await http<TwitchRuntimeStatusResponse>(
    "/api/twitch/runtime/status",
    {
      method: "GET",
    },
  );

  return result.data;
}

export async function startRuntime(): Promise<TwitchRuntimeStatus> {
  const result = await http<TwitchRuntimeStatusResponse>(
    "/api/twitch/runtime/start",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return result.data;
}

export async function stopRuntime(): Promise<TwitchRuntimeStatus> {
  const result = await http<TwitchRuntimeStatusResponse>(
    "/api/twitch/runtime/stop",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return result.data;
}

export async function sendBotMessage(message: string): Promise<void> {
  await http<SendChatMessageResponse>("/api/twitch/chat/send", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}