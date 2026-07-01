import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  GiveawaySettings,
  PrismaClient,
} from "../../../generated/prisma/client.js";
import {
  GIVEAWAY_SETTINGS_KEY,
  defaultGiveawayMessages,
  defaultGiveawayPresets,
  type UpdateGiveawaySettingsInput,
} from "./giveaway.types.js";

export class GiveawayRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getSettingsRow(): Promise<GiveawaySettings> {
    const existing = await this.db.giveawaySettings.findUnique({
      where: { key: GIVEAWAY_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.giveawaySettings.create({
      data: {
        key: GIVEAWAY_SETTINGS_KEY,
        presets: defaultGiveawayPresets as unknown as Prisma.InputJsonValue,
        messages: defaultGiveawayMessages as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(
    input: UpdateGiveawaySettingsInput,
  ): Promise<GiveawaySettings> {
    await this.getSettingsRow();

    return this.db.giveawaySettings.update({
      where: { key: GIVEAWAY_SETTINGS_KEY },
      data: {
        ...(input.joinKeyword !== undefined
          ? { joinKeyword: input.joinKeyword }
          : {}),
        ...(input.selfCommand !== undefined
          ? { selfCommand: input.selfCommand }
          : {}),
        ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount } : {}),
        ...(input.durationSeconds !== undefined
          ? { durationSeconds: input.durationSeconds }
          : {}),
        ...(input.reminderMinSeconds !== undefined
          ? { reminderMinSeconds: input.reminderMinSeconds }
          : {}),
        ...(input.reminderMaxSeconds !== undefined
          ? { reminderMaxSeconds: input.reminderMaxSeconds }
          : {}),
        ...(input.presets !== undefined
          ? { presets: input.presets as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.messages !== undefined
          ? { messages: input.messages as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
