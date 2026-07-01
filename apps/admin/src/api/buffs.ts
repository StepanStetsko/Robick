import { http } from "./http";
import type { BuffDefinition, SaveBuffDefinitionDto } from "../types/buffs";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

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
