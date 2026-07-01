import { http } from "./http";
import type {
  GiveawaySettings,
  SaveGiveawaySettingsDto,
} from "../types/giveaway";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getGiveawaySettings(): Promise<GiveawaySettings> {
  const result = await http<ApiResponse<GiveawaySettings>>(
    "/api/twitch/giveaway/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateGiveawaySettings(
  payload: SaveGiveawaySettingsDto,
): Promise<GiveawaySettings> {
  const result = await http<ApiResponse<GiveawaySettings>>(
    "/api/twitch/giveaway/settings",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}
