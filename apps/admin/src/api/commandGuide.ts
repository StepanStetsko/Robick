import { http } from "./http";
import type { CommandGuide, GuideGroup } from "../types/commandGuide";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

/**
 * Public read of the command guide. Uses a raw fetch (not `http`) so an
 * anonymous viewer never triggers the global unauthorized handler.
 */
export async function getCommandGuide(): Promise<CommandGuide> {
  const response = await fetch(
    new URL("/api/public/command-guide", API_BASE_URL).toString(),
    { credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiResponse<CommandGuide>;
  return result.data;
}

export async function saveCommandGuide(
  groups: GuideGroup[],
): Promise<CommandGuide> {
  const result = await http<ApiResponse<CommandGuide>>(
    "/api/twitch/command-guide",
    {
      method: "PATCH",
      body: JSON.stringify({ groups }),
    },
  );

  return result.data;
}

export async function generateCommandGuide(): Promise<CommandGuide> {
  const result = await http<ApiResponse<CommandGuide>>(
    "/api/twitch/command-guide/generate",
    { method: "POST" },
  );

  return result.data;
}
