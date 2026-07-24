import { http } from "./http";
import type { PollState, StartPollInput } from "../types/poll";

type ApiResponse<T> = { ok: boolean; data: T };

export async function getPoll(): Promise<PollState> {
  const result = await http<ApiResponse<PollState>>("/api/twitch/poll", {
    method: "GET",
  });
  return result.data;
}

export async function startPoll(input: StartPollInput): Promise<PollState> {
  const result = await http<ApiResponse<PollState>>("/api/twitch/poll/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.data;
}

export async function stopPoll(): Promise<PollState> {
  const result = await http<ApiResponse<PollState>>("/api/twitch/poll/stop", {
    method: "POST",
  });
  return result.data;
}

export async function clearPoll(): Promise<PollState> {
  const result = await http<ApiResponse<PollState>>("/api/twitch/poll/clear", {
    method: "POST",
  });
  return result.data;
}
