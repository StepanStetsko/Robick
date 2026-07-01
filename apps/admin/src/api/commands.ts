import { http } from "./http";
import type {
  CreateCustomCommandDto,
  CustomCommand,
  CustomCommandUsageHistoryEntry,
  UpdateCustomCommandDto,
} from "../types/commands";

type CustomCommandListResponse = {
  ok: boolean;
  data: CustomCommand[];
};

type CustomCommandItemResponse = {
  ok: boolean;
  data: CustomCommand;
};

type CommandUsageHistoryResponse = {
  ok: boolean;
  data: CustomCommandUsageHistoryEntry[];
};

export async function getCustomCommands(): Promise<CustomCommand[]> {
  const result = await http<CustomCommandListResponse>(
    "/api/twitch/commands/custom",
    { method: "GET" },
  );

  return Array.isArray(result.data) ? result.data : [];
}

export async function getCustomCommandUsageHistory(
  limit = 50,
): Promise<CustomCommandUsageHistoryEntry[]> {
  const result = await http<CommandUsageHistoryResponse>(
    `/api/twitch/commands/custom/history?limit=${limit}`,
    { method: "GET" },
  );

  return Array.isArray(result.data) ? result.data : [];
}

export async function createCustomCommand(
  payload: CreateCustomCommandDto,
): Promise<CustomCommand> {
  const result = await http<CustomCommandItemResponse>(
    "/api/twitch/commands/custom",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function updateCustomCommand(
  name: string,
  payload: UpdateCustomCommandDto,
): Promise<CustomCommand> {
  const result = await http<CustomCommandItemResponse>(
    `/api/twitch/commands/custom/${name}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function deleteCustomCommand(name: string): Promise<void> {
  await http<void>(`/api/twitch/commands/custom/${name}`, {
    method: "DELETE",
    parseJson: false,
  });
}