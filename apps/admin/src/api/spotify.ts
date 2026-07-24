import { http } from "./http";
import type {
  SpotifyDevice,
  SpotifySettings,
  UpdateSpotifySettingsInput,
} from "../types/spotify";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getSpotifySettings(): Promise<SpotifySettings> {
  const result = await http<ApiResponse<SpotifySettings>>(
    "/api/twitch/spotify/settings",
    { method: "GET" },
  );
  return result.data;
}

export async function updateSpotifySettings(
  input: UpdateSpotifySettingsInput,
): Promise<SpotifySettings> {
  const result = await http<ApiResponse<SpotifySettings>>(
    "/api/twitch/spotify/settings",
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return result.data;
}

export async function getSpotifyDevices(): Promise<SpotifyDevice[]> {
  const result = await http<ApiResponse<SpotifyDevice[]>>(
    "/api/twitch/spotify/devices",
    { method: "GET" },
  );
  return result.data;
}

export async function disconnectSpotify(): Promise<SpotifySettings> {
  const result = await http<ApiResponse<SpotifySettings>>(
    "/api/twitch/spotify/disconnect",
    { method: "POST" },
  );
  return result.data;
}
