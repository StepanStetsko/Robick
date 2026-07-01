import { http } from "./http";
import type {
  AwardEconomyDto,
  EconomySettings,
  SaveEconomySettingsDto,
  Wallet,
  WalletPage,
} from "../types/economy";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
};

export async function getEconomySettings(): Promise<EconomySettings> {
  const result = await http<ApiResponse<EconomySettings>>(
    "/api/twitch/economy/settings",
    { method: "GET" },
  );

  return result.data;
}

export async function updateEconomySettings(
  payload: SaveEconomySettingsDto,
): Promise<EconomySettings> {
  const result = await http<ApiResponse<EconomySettings>>(
    "/api/twitch/economy/settings",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return result.data;
}

export async function getEconomyWallets(params?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<WalletPage> {
  const query = new URLSearchParams();
  query.set("limit", String(params?.limit ?? 50));
  query.set("offset", String(params?.offset ?? 0));

  const search = params?.search?.trim();
  if (search) {
    query.set("search", search);
  }

  const result = await http<ApiResponse<WalletPage>>(
    `/api/twitch/economy/wallets?${query.toString()}`,
    { method: "GET" },
  );

  return result.data;
}

export async function deleteEconomyWallet(twitchUserId: string): Promise<void> {
  await http<ApiResponse<unknown>>(
    `/api/twitch/economy/wallets/${encodeURIComponent(twitchUserId)}`,
    { method: "DELETE" },
  );
}

export async function purgeSimWallets(): Promise<number> {
  const result = await http<ApiResponse<{ removed: number }>>(
    "/api/twitch/economy/wallets/purge-sim",
    { method: "POST" },
  );

  return result.data.removed;
}

export async function awardEconomy(payload: AwardEconomyDto): Promise<Wallet> {
  const result = await http<ApiResponse<Wallet>>("/api/twitch/economy/award", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result.data;
}
