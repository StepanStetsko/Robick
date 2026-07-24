import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  DonatelloDonation,
  DonatelloSettings,
  PrismaClient,
} from "../../../generated/prisma/client.js";
import {
  DONATELLO_SETTINGS_KEY,
  defaultDonatelloMessages,
  type UpdateDonatelloSettingsInput,
} from "./donatello.types.js";

export type CreateDonatelloDonationInput = {
  pubId: string;
  clientName: string | null;
  amount: number | null;
  currency: string | null;
  message: string | null;
  songRequestId: string | null;
  songTitle: string | null;
  outcome: string;
};

export class DonatelloRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  // ----- Settings -----

  async getSettingsRow(): Promise<DonatelloSettings> {
    const existing = await this.db.donatelloSettings.findUnique({
      where: { key: DONATELLO_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.donatelloSettings.create({
      data: {
        key: DONATELLO_SETTINGS_KEY,
        messages: defaultDonatelloMessages as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(
    input: UpdateDonatelloSettingsInput,
  ): Promise<DonatelloSettings> {
    await this.getSettingsRow();

    return this.db.donatelloSettings.update({
      where: { key: DONATELLO_SETTINGS_KEY },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.songMinAmount !== undefined
          ? { songMinAmount: input.songMinAmount }
          : {}),
        ...(input.songPriority !== undefined
          ? { songPriority: input.songPriority }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.thankYouInChat !== undefined
          ? { thankYouInChat: input.thankYouInChat }
          : {}),
        ...(input.messages !== undefined
          ? { messages: input.messages as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  // ----- Donations (dedup + history) -----

  async findDonationByPubId(pubId: string): Promise<DonatelloDonation | null> {
    return this.db.donatelloDonation.findUnique({ where: { pubId } });
  }

  async createDonation(
    input: CreateDonatelloDonationInput,
  ): Promise<DonatelloDonation> {
    return this.db.donatelloDonation.create({ data: input });
  }

  async listDonations(limit = 30): Promise<DonatelloDonation[]> {
    return this.db.donatelloDonation.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
