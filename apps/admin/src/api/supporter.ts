import { http } from "./http";
import type {
  AddSupporterInput,
  SupporterInspect,
  SupporterSettings,
  SupporterStatusEntry,
  UpdateSupporterSettingsInput,
} from "../types/supporter";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getSupporterSettings(): Promise<SupporterSettings> {
  const result = await http<ApiResponse<SupporterSettings>>(
    "/api/twitch/supporter/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateSupporterSettings(
  input: UpdateSupporterSettingsInput,
): Promise<SupporterSettings> {
  const result = await http<ApiResponse<SupporterSettings>>(
    "/api/twitch/supporter/settings",
    { method: "PATCH", body: JSON.stringify(input) },
  );

  return result.data;
}

export async function getSupporters(): Promise<SupporterStatusEntry[]> {
  const result = await http<ApiResponse<SupporterStatusEntry[]>>(
    "/api/twitch/supporter/subscribers",
    { method: "GET" },
  );

  return result.data;
}

export async function addSupporter(
  input: AddSupporterInput,
): Promise<SupporterStatusEntry> {
  const result = await http<ApiResponse<SupporterStatusEntry>>(
    "/api/twitch/supporter/subscribers",
    { method: "POST", body: JSON.stringify(input) },
  );

  return result.data;
}

export async function removeSupporter(login: string): Promise<void> {
  await http<ApiResponse<null>>(
    `/api/twitch/supporter/subscribers/${encodeURIComponent(login)}`,
    { method: "DELETE" },
  );
}

export async function inspectSupporter(
  login: string,
): Promise<SupporterInspect> {
  const result = await http<ApiResponse<SupporterInspect>>(
    `/api/twitch/supporter/inspect/${encodeURIComponent(login)}`,
    { method: "GET" },
  );

  return result.data;
}

export async function debugSetStreak(
  login: string,
  streakDays: number,
): Promise<SupporterInspect> {
  const result = await http<ApiResponse<SupporterInspect>>(
    "/api/twitch/supporter/debug/streak",
    { method: "POST", body: JSON.stringify({ login, streakDays }) },
  );

  return result.data;
}

export async function debugResetBonus(
  login: string,
): Promise<SupporterInspect> {
  const result = await http<ApiResponse<SupporterInspect>>(
    "/api/twitch/supporter/debug/reset-bonus",
    { method: "POST", body: JSON.stringify({ login }) },
  );

  return result.data;
}
