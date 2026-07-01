import { http } from "./http";
import type {
  GuessGameSettings,
  SaveGuessGameSettingsDto,
} from "../types/guess";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getGuessGameSettings(): Promise<GuessGameSettings> {
  const result = await http<ApiResponse<GuessGameSettings>>(
    "/api/twitch/guess/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateGuessGameSettings(
  payload: SaveGuessGameSettingsDto,
): Promise<GuessGameSettings> {
  const result = await http<ApiResponse<GuessGameSettings>>(
    "/api/twitch/guess/settings",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}
