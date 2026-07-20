import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  FunMeterFeature,
  PrismaClient,
  ViewerFunStat,
} from "../../../generated/prisma/client.js";
import type {
  CreateFunMeterFeatureInput,
  FunMeterDirection,
  FunMeterViewerInput,
  UpdateFunMeterFeatureInput,
} from "./fun-meter.types.js";

export type ApplyRollInput = {
  featureKey: string;
  viewer: FunMeterViewerInput;
  buildUpdate: (current: { previousScore: number; rollsCount: number }) => {
    direction: FunMeterDirection;
    delta: number;
    newScore: number;
    lastMessage: string;
  };
};

export type ApplyRollResult = {
  stat: ViewerFunStat;
  previousScore: number;
  rank: number;
};

export class FunMeterRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listFeatures(): Promise<FunMeterFeature[]> {
    return this.db.funMeterFeature.findMany({
      orderBy: [{ enabled: "desc" }, { title: "asc" }],
    });
  }

  async listEnabledFeatures(): Promise<FunMeterFeature[]> {
    return this.db.funMeterFeature.findMany({
      where: { enabled: true },
      orderBy: [{ title: "asc" }],
    });
  }

  async findFeatureByKey(key: string): Promise<FunMeterFeature | null> {
    return this.db.funMeterFeature.findUnique({
      where: { key },
    });
  }

  async createFeature(input: CreateFunMeterFeatureInput): Promise<FunMeterFeature> {
    return this.db.funMeterFeature.create({
      data: {
        key: input.key,
        title: input.title,
        unit: input.unit ?? "см",
        enabled: input.enabled ?? true,
        aliases: input.aliases,
        leaderboardArgs: input.leaderboardArgs ?? [],
        selfArgs: input.selfArgs ?? [],
        rollLimitMode: input.rollLimitMode ?? "daily",
        increaseChance: input.increaseChance ?? 0.6,
        minRoll: input.minRoll ?? 1,
        maxRoll: input.maxRoll ?? 20,
        jokes: input.jokes as Prisma.InputJsonValue,
        messages: input.messages as Prisma.InputJsonValue,
      },
    });
  }

  async updateFeature(
    key: string,
    input: UpdateFunMeterFeatureInput,
  ): Promise<FunMeterFeature | null> {
    try {
      return await this.db.funMeterFeature.update({
        where: { key },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
          ...(input.leaderboardArgs !== undefined
            ? { leaderboardArgs: input.leaderboardArgs }
            : {}),
          ...(input.selfArgs !== undefined ? { selfArgs: input.selfArgs } : {}),
          ...(input.rollLimitMode !== undefined
            ? { rollLimitMode: input.rollLimitMode }
            : {}),
          ...(input.increaseChance !== undefined
            ? { increaseChance: input.increaseChance }
            : {}),
          ...(input.minRoll !== undefined ? { minRoll: input.minRoll } : {}),
          ...(input.maxRoll !== undefined ? { maxRoll: input.maxRoll } : {}),
          ...(input.jokes !== undefined
            ? { jokes: input.jokes as Prisma.InputJsonValue }
            : {}),
          ...(input.messages !== undefined
            ? { messages: input.messages as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return null;
      }

      throw error;
    }
  }

  async applyRoll(input: ApplyRollInput): Promise<ApplyRollResult> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.viewerFunStat.upsert({
        where: {
          featureKey_twitchUserId: {
            featureKey: input.featureKey,
            twitchUserId: input.viewer.twitchUserId,
          },
        },
        update: {
          userLogin: input.viewer.userLogin,
          displayName: input.viewer.displayName ?? null,
        },
        create: {
          featureKey: input.featureKey,
          twitchUserId: input.viewer.twitchUserId,
          userLogin: input.viewer.userLogin,
          displayName: input.viewer.displayName ?? null,
          score: 0,
          rollsCount: 0,
        },
      });

      const update = input.buildUpdate({
        previousScore: current.score,
        rollsCount: current.rollsCount,
      });

      const stat = await tx.viewerFunStat.update({
        where: { id: current.id },
        data: {
          userLogin: input.viewer.userLogin,
          displayName: input.viewer.displayName ?? null,
          score: update.newScore,
          rollsCount: { increment: 1 },
          lastDelta: update.delta,
          lastDirection: update.direction,
          lastMessage: update.lastMessage,
        },
      });

      const rank = await tx.viewerFunStat.count({
        where: {
          featureKey: input.featureKey,
          score: { gt: stat.score },
        },
      });

      return {
        stat,
        previousScore: current.score,
        rank: rank + 1,
      };
    });
  }

  async findViewer(
    featureKey: string,
    twitchUserId: string,
  ): Promise<ViewerFunStat | null> {
    return this.db.viewerFunStat.findUnique({
      where: {
        featureKey_twitchUserId: {
          featureKey,
          twitchUserId,
        },
      },
    });
  }

  /**
   * Persist the local day of the viewer's last chat roll, so the daily limit
   * survives a bot restart. No-op if the stat row does not exist yet.
   */
  async setLastRollDay(
    featureKey: string,
    twitchUserId: string,
    day: string,
  ): Promise<void> {
    await this.db.viewerFunStat.updateMany({
      where: { featureKey, twitchUserId },
      data: { lastRollDay: day },
    });
  }

  async getRank(featureKey: string, score: number): Promise<number> {
    const higherScores = await this.db.viewerFunStat.count({
      where: {
        featureKey,
        score: { gt: score },
      },
    });

    return higherScores + 1;
  }

  async getLeaderboard(
    featureKey: string,
    limit: number,
  ): Promise<ViewerFunStat[]> {
    return this.db.viewerFunStat.findMany({
      where: { featureKey },
      orderBy: [
        { score: "desc" },
        { updatedAt: "asc" },
      ],
      take: limit,
    });
  }

  async listViewers(featureKey: string, limit: number): Promise<ViewerFunStat[]> {
    return this.db.viewerFunStat.findMany({
      where: { featureKey },
      orderBy: [
        { score: "desc" },
        { updatedAt: "asc" },
      ],
      take: limit,
    });
  }

  async resetUser(featureKey: string, twitchUserId: string): Promise<number> {
    const result = await this.db.viewerFunStat.deleteMany({
      where: {
        featureKey,
        twitchUserId,
      },
    });

    return result.count;
  }

  async resetAll(featureKey: string): Promise<number> {
    const result = await this.db.viewerFunStat.deleteMany({
      where: { featureKey },
    });

    return result.count;
  }
}
