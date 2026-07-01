import { prisma } from "../../../core/db/PrismaClient.js";
import type {
  PrismaClient,
  ViewerProtection,
} from "../../../generated/prisma/client.js";

export class ProtectionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getActive(
    twitchUserId: string,
    now: Date,
  ): Promise<ViewerProtection | null> {
    const row = await this.db.viewerProtection.findUnique({
      where: { twitchUserId },
    });

    if (!row || row.expiresAt <= now) {
      return null;
    }

    return row;
  }

  async upsert(
    twitchUserId: string,
    userLogin: string,
    expiresAt: Date,
  ): Promise<ViewerProtection> {
    return this.db.viewerProtection.upsert({
      where: { twitchUserId },
      update: { userLogin, expiresAt },
      create: { twitchUserId, userLogin, expiresAt },
    });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.db.viewerProtection.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
}
