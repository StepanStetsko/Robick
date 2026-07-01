import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  ActiveBuff,
  BuffDefinition,
  PrismaClient,
} from "../../../generated/prisma/client.js";
import type {
  CreateBuffDefinitionInput,
  UpdateBuffDefinitionInput,
} from "./buff.types.js";

export type CreateActiveBuffData = {
  twitchUserId: string;
  userLogin: string;
  buffKey: string;
  title: string;
  kind: string;
  effectType: string;
  magnitude: number;
  durationMode: string;
  expiresAt: Date | null;
  rollsRemaining: number | null;
  source: string;
};

export class BuffRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listDefinitions(): Promise<BuffDefinition[]> {
    return this.db.buffDefinition.findMany({
      orderBy: [{ enabled: "desc" }, { title: "asc" }],
    });
  }

  async listEnabledDefinitions(): Promise<BuffDefinition[]> {
    return this.db.buffDefinition.findMany({
      where: { enabled: true },
      orderBy: [{ cost: "asc" }],
    });
  }

  async findDefinition(key: string): Promise<BuffDefinition | null> {
    return this.db.buffDefinition.findUnique({ where: { key } });
  }

  async createDefinition(
    input: Required<CreateBuffDefinitionInput>,
  ): Promise<BuffDefinition> {
    return this.db.buffDefinition.create({
      data: {
        key: input.key,
        title: input.title,
        description: input.description,
        kind: input.kind,
        effectType: input.effectType,
        magnitude: input.magnitude,
        durationMode: input.durationMode,
        durationValue: input.durationValue,
        cost: input.cost,
        target: input.target,
        enabled: input.enabled,
      },
    });
  }

  async updateDefinition(
    key: string,
    input: UpdateBuffDefinitionInput,
  ): Promise<BuffDefinition | null> {
    try {
      return await this.db.buffDefinition.update({
        where: { key },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.effectType !== undefined
            ? { effectType: input.effectType }
            : {}),
          ...(input.magnitude !== undefined
            ? { magnitude: input.magnitude }
            : {}),
          ...(input.durationMode !== undefined
            ? { durationMode: input.durationMode }
            : {}),
          ...(input.durationValue !== undefined
            ? { durationValue: input.durationValue }
            : {}),
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
          ...(input.target !== undefined ? { target: input.target } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
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

  async deleteDefinition(key: string): Promise<boolean> {
    try {
      await this.db.buffDefinition.delete({ where: { key } });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return false;
      }

      throw error;
    }
  }

  async listActiveBuffs(twitchUserId: string): Promise<ActiveBuff[]> {
    return this.db.activeBuff.findMany({
      where: { twitchUserId },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  async listActiveBuffsForUsers(
    twitchUserIds: string[],
  ): Promise<ActiveBuff[]> {
    if (twitchUserIds.length === 0) {
      return [];
    }

    return this.db.activeBuff.findMany({
      where: { twitchUserId: { in: twitchUserIds } },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  async deleteExpiredForUsers(
    twitchUserIds: string[],
    now: Date,
  ): Promise<void> {
    if (twitchUserIds.length === 0) {
      return;
    }

    await this.db.activeBuff.deleteMany({
      where: {
        twitchUserId: { in: twitchUserIds },
        durationMode: "time",
        expiresAt: { lt: now },
      },
    });
  }

  async createActiveBuff(data: CreateActiveBuffData): Promise<ActiveBuff> {
    return this.db.activeBuff.create({ data });
  }

  async deleteActiveBuff(id: string): Promise<void> {
    await this.db.activeBuff.deleteMany({ where: { id } });
  }

  async deleteExpiredForUser(twitchUserId: string, now: Date): Promise<void> {
    await this.db.activeBuff.deleteMany({
      where: {
        twitchUserId,
        durationMode: "time",
        expiresAt: { lt: now },
      },
    });
  }

  async setRollsRemaining(id: string, rollsRemaining: number): Promise<void> {
    await this.db.activeBuff.update({
      where: { id },
      data: { rollsRemaining },
    });
  }
}
