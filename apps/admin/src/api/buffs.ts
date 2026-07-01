import { http } from "./http";
import type {
  BuffDefinition,
  BuffSettings,
  SaveBuffDefinitionDto,
  UpdateBuffSettingsInput,
} from "../types/buffs";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getBuffSettings(): Promise<BuffSettings> {
  const result = await http<ApiResponse<BuffSettings>>(
    "/api/twitch/buffs/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateBuffSettings(
  payload: UpdateBuffSettingsInput,
): Promise<BuffSettings> {
  const result = await http<ApiResponse<BuffSettings>>(
    "/api/twitch/buffs/settings",
    { method: "PATCH", body: JSON.stringify(payload) },
  );

  return result.data;
}

export async function getBuffDefinitions(): Promise<BuffDefinition[]> {
  const result = await http<ApiResponse<BuffDefinition[]>>(
    "/api/twitch/buffs/definitions",
    { method: "GET" },
  );

  return result.data;
}

export async function createBuffDefinition(
  payload: SaveBuffDefinitionDto,
): Promise<BuffDefinition> {
  const result = await http<ApiResponse<BuffDefinition>>(
    "/api/twitch/buffs/definitions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function updateBuffDefinition(
  key: string,
  payload: Partial<SaveBuffDefinitionDto>,
): Promise<BuffDefinition> {
  const result = await http<ApiResponse<BuffDefinition>>(
    `/api/twitch/buffs/definitions/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function deleteBuffDefinition(key: string): Promise<void> {
  await http(`/api/twitch/buffs/definitions/${encodeURIComponent(key)}`, {
    method: "DELETE",
    parseJson: false,
  });
}
