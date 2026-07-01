import { http } from "./http";
import type {
  SongQueueState,
  SongRequestEntry,
  SongRequestSettings,
  UpdateSongRequestSettingsInput,
} from "../types/songRequest";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getSongRequestSettings(): Promise<SongRequestSettings> {
  const result = await http<ApiResponse<SongRequestSettings>>(
    "/api/twitch/song-request/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateSongRequestSettings(
  input: UpdateSongRequestSettingsInput,
): Promise<SongRequestSettings> {
  const result = await http<ApiResponse<SongRequestSettings>>(
    "/api/twitch/song-request/settings",
    { method: "PATCH", body: JSON.stringify(input) },
  );

  return result.data;
}

export async function getSongQueue(): Promise<SongQueueState> {
  const result = await http<ApiResponse<SongQueueState>>(
    "/api/twitch/song-request/queue",
    { method: "GET" },
  );

  return result.data;
}

export async function addSong(url: string): Promise<SongRequestEntry> {
  const result = await http<ApiResponse<SongRequestEntry>>(
    "/api/twitch/song-request/request",
    { method: "POST", body: JSON.stringify({ url }) },
  );

  return result.data;
}

export async function getSongHistory(): Promise<SongRequestEntry[]> {
  const result = await http<ApiResponse<SongRequestEntry[]>>(
    "/api/twitch/song-request/history",
    { method: "GET" },
  );

  return result.data;
}

export async function playPreviousSong(): Promise<SongQueueState> {
  const result = await http<ApiResponse<SongQueueState>>(
    "/api/twitch/song-request/previous",
    { method: "POST" },
  );

  return result.data;
}

export async function skipCurrentSong(): Promise<SongQueueState> {
  const result = await http<ApiResponse<SongQueueState>>(
    "/api/twitch/song-request/skip",
    { method: "POST" },
  );

  return result.data;
}

export async function togglePauseSong(): Promise<SongQueueState> {
  const result = await http<ApiResponse<SongQueueState>>(
    "/api/twitch/song-request/pause",
    { method: "POST" },
  );

  return result.data;
}

export async function clearSongQueue(): Promise<SongQueueState> {
  const result = await http<ApiResponse<SongQueueState>>(
    "/api/twitch/song-request/clear",
    { method: "POST" },
  );

  return result.data;
}

export async function removeSong(id: string): Promise<SongQueueState> {
  const result = await http<ApiResponse<SongQueueState>>(
    `/api/twitch/song-request/${id}`,
    { method: "DELETE" },
  );

  return result.data;
}
