import { http } from "./http";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export type HelpPreview = {
  commands: string;
  message: string;
};

export async function getHelpPreview(): Promise<HelpPreview> {
  const result = await http<ApiResponse<HelpPreview>>(
    "/api/twitch/help/preview",
    { method: "GET" },
  );

  return result.data;
}
