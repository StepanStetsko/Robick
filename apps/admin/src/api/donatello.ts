import { http } from "./http";
import type {
  DonatelloDonation,
  DonatelloSettings,
  UpdateDonatelloSettingsInput,
} from "../types/donatello";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getDonatelloSettings(): Promise<DonatelloSettings> {
  const result = await http<ApiResponse<DonatelloSettings>>(
    "/api/twitch/donatello/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateDonatelloSettings(
  input: UpdateDonatelloSettingsInput,
): Promise<DonatelloSettings> {
  const result = await http<ApiResponse<DonatelloSettings>>(
    "/api/twitch/donatello/settings",
    { method: "PATCH", body: JSON.stringify(input) },
  );

  return result.data;
}

export async function getDonatelloDonations(): Promise<DonatelloDonation[]> {
  const result = await http<ApiResponse<DonatelloDonation[]>>(
    "/api/twitch/donatello/donations",
    { method: "GET" },
  );

  return result.data;
}
