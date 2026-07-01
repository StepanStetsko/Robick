import type { UnityCapabilities } from "../types/engine";
import { http } from "./http";

export async function dispatchUnityAction(payload: {
  eventName: string;
  payload?: Record<string, unknown>;
}): Promise<{ eventId: string; eventName: string; deliveredCount: number }> {
  const result = await http<{
    ok: boolean;
    data: { eventId: string; eventName: string; deliveredCount: number };
  }>("/api/twitch/engine/unity/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export function resetUnityScene() {
  return dispatchUnityAction({
    eventName: "reset_scene",
    payload: {
      source: "admin_dashboard",
    },
  });
}

export async function getUnityCapabilities(): Promise<UnityCapabilities | null> {
  const result = await http<{
    ok: boolean;
    data: UnityCapabilities | null;
  }>("/api/twitch/engine/unity/capabilities");

  return result.data;
}
