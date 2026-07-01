import { http } from "./http";
import type {
  FunMeterFeature,
  FunMeterRollResult,
  FunMeterViewerStat,
  SaveFunMeterFeatureDto,
} from "../types/funMeter";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getFunMeterFeatures(): Promise<FunMeterFeature[]> {
  const result = await http<ApiResponse<FunMeterFeature[]>>(
    "/api/twitch/fun-meter/features",
    { method: "GET" },
  );

  return result.data;
}

export async function createFunMeterFeature(
  payload: SaveFunMeterFeatureDto,
): Promise<FunMeterFeature> {
  const result = await http<ApiResponse<FunMeterFeature>>(
    "/api/twitch/fun-meter/features",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function updateFunMeterFeature(
  key: string,
  payload: Partial<SaveFunMeterFeatureDto>,
): Promise<FunMeterFeature> {
  const result = await http<ApiResponse<FunMeterFeature>>(
    `/api/twitch/fun-meter/features/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function getFunMeterViewers(
  featureKey: string,
  limit = 50,
): Promise<FunMeterViewerStat[]> {
  const result = await http<ApiResponse<FunMeterViewerStat[]>>(
    `/api/twitch/fun-meter/features/${encodeURIComponent(featureKey)}/viewers?limit=${limit}`,
    { method: "GET" },
  );

  return result.data;
}

export async function testFunMeterRoll(
  featureKey: string,
): Promise<FunMeterRollResult> {
  const result = await http<ApiResponse<FunMeterRollResult>>(
    `/api/twitch/fun-meter/features/${encodeURIComponent(featureKey)}/test-roll`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  return result.data;
}

export async function resetFunMeterUser(
  featureKey: string,
  twitchUserId: string,
): Promise<{ deletedCount: number }> {
  const result = await http<ApiResponse<{ deletedCount: number }>>(
    `/api/twitch/fun-meter/features/${encodeURIComponent(featureKey)}/reset-user`,
    {
      method: "POST",
      body: JSON.stringify({ twitchUserId }),
    },
  );

  return result.data;
}
