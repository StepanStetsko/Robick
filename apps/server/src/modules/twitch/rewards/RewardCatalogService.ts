import { AccountType } from "../../../generated/prisma/client.js";
import type { AuthRepository } from "../../auth/AuthRepository.js";
import type { TwitchApiClient, TwitchCustomReward } from "../TwitchApiClient.js";
import type { RewardMappingDto } from "./reward-mapping.types.js";
import { RewardMappingService } from "./RewardMappingService.js";

export type RewardCatalogItemDto = {
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  prompt: string;
  backgroundColor: string | null;
  isEnabled: boolean;
  isPaused: boolean;
  isInStock: boolean;
  cooldownExpiresAt: string | null;
  mapping: RewardMappingDto | null;
};

export type RewardCatalogResponseDto = {
  mapped: RewardCatalogItemDto[];
  unmapped: RewardCatalogItemDto[];
};

function mapRewardToCatalogItem(
  reward: TwitchCustomReward,
  mapping: RewardMappingDto | null,
): RewardCatalogItemDto {
  return {
    rewardId: reward.id,
    rewardTitle: reward.title,
    rewardCost: reward.cost,
    prompt: reward.prompt,
    backgroundColor: reward.background_color,
    isEnabled: reward.is_enabled,
    isPaused: reward.is_paused,
    isInStock: reward.is_in_stock,
    cooldownExpiresAt: reward.cooldown_expires_at,
    mapping,
  };
}

function sortCatalogItems(items: RewardCatalogItemDto[]): RewardCatalogItemDto[] {
  return [...items].sort((left, right) => {
    if (left.mapping && !right.mapping) {
      return -1;
    }

    if (!left.mapping && right.mapping) {
      return 1;
    }

    return left.rewardTitle.localeCompare(right.rewardTitle, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

export class RewardCatalogService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly twitchApiClient: TwitchApiClient,
    private readonly rewardMappingService: RewardMappingService,
  ) {}

  async getCatalog(): Promise<RewardCatalogResponseDto> {
    const broadcaster = await this.authRepository.findAccountByType(
      AccountType.broadcaster,
    );

    if (!broadcaster) {
      throw new Error("Broadcaster is not connected");
    }

    const [rewards, mappings] = await Promise.all([
      this.twitchApiClient.getCustomRewards(
        "broadcaster",
        broadcaster.providerUserId,
      ),
      this.rewardMappingService.getAll(),
    ]);

    const mappingsByRewardId = new Map(
      mappings.map((mapping) => [mapping.rewardId, mapping]),
    );

    const mapped: RewardCatalogItemDto[] = [];
    const unmapped: RewardCatalogItemDto[] = [];

    for (const reward of rewards) {
      const item = mapRewardToCatalogItem(
        reward,
        mappingsByRewardId.get(reward.id) ?? null,
      );

      if (item.mapping) {
        mapped.push(item);
      } else {
        unmapped.push(item);
      }
    }

    return {
      mapped: sortCatalogItems(mapped),
      unmapped: sortCatalogItems(unmapped),
    };
  }
}
