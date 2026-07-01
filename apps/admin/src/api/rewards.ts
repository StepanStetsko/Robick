import { http } from "./http";
import type {
  CreateRewardMappingDto,
  RewardCatalog,
  RewardMapping,
  UpdateRewardMappingDto,
} from "../types/rewards";

type RewardCatalogResponse = {
  ok: boolean;
  data: RewardCatalog;
};

type RewardMappingsListResponse = {
  ok: boolean;
  data: RewardMapping[];
};

type RewardMappingItemResponse = {
  ok: boolean;
  data: RewardMapping;
};

export async function getRewardCatalog(): Promise<RewardCatalog> {
  const result = await http<RewardCatalogResponse>("/api/twitch/rewards/catalog", {
    method: "GET",
  });

  return {
    mapped: Array.isArray(result.data?.mapped) ? result.data.mapped : [],
    unmapped: Array.isArray(result.data?.unmapped) ? result.data.unmapped : [],
  };
}

export async function getRewardMappings(): Promise<RewardMapping[]> {
  const result = await http<RewardMappingsListResponse>("/api/twitch/rewards/mappings", {
    method: "GET",
  });

  return Array.isArray(result.data) ? result.data : [];
}

export async function createRewardMapping(
  payload: CreateRewardMappingDto,
): Promise<RewardMapping> {
  const result = await http<RewardMappingItemResponse>("/api/twitch/rewards/mappings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export async function updateRewardMapping(
  id: string,
  payload: UpdateRewardMappingDto,
): Promise<RewardMapping> {
  const result = await http<RewardMappingItemResponse>(`/api/twitch/rewards/mappings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return result.data;
}

export async function deleteRewardMapping(id: string): Promise<void> {
  await http(`/api/twitch/rewards/mappings/${id}`, {
    method: "DELETE",
    parseJson: false,
  });
}

export async function testRewardDispatch(payload: {
  rewardId: string;
  userInput?: string;
  userLogin?: string;
  userName?: string;
}): Promise<{ redemptionId: string; rewardId: string; queued: boolean; dispatched?: boolean }> {
  const result = await http<{
    ok: boolean;
    data: { redemptionId: string; rewardId: string; queued: boolean; dispatched?: boolean };
  }>("/api/twitch/rewards/test-dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}

