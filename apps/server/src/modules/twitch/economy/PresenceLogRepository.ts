import { prisma } from "../../../core/db/PrismaClient.js";
import type {
  PrismaClient,
  ViewerPresence,
} from "../../../generated/prisma/client.js";

export type PresenceUpsertInput = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  presentNow: boolean;
  hasChatted: boolean;
  messageCount: number;
  lastChatAt: Date | null;
};

/**
 * DB persistence for the "who's on stream" log (ViewerPresence). Scoped by
 * local `day` (YYYY-MM-DD) so a daily reset is just `deleteOtherDays` /
 * `deleteAll`.
 */
export class PresenceLogRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listByDay(day: string): Promise<ViewerPresence[]> {
    return this.db.viewerPresence.findMany({ where: { day } });
  }

  /** Persist the whole in-memory snapshot for the given day (one upsert/row). */
  async upsertMany(day: string, entries: PresenceUpsertInput[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await this.db.$transaction(
      entries.map((entry) =>
        this.db.viewerPresence.upsert({
          where: { twitchUserId: entry.twitchUserId },
          update: {
            userLogin: entry.userLogin,
            displayName: entry.displayName,
            day,
            firstSeenAt: entry.firstSeenAt,
            lastSeenAt: entry.lastSeenAt,
            presentNow: entry.presentNow,
            hasChatted: entry.hasChatted,
            messageCount: entry.messageCount,
            lastChatAt: entry.lastChatAt,
          },
          create: {
            twitchUserId: entry.twitchUserId,
            userLogin: entry.userLogin,
            displayName: entry.displayName,
            day,
            firstSeenAt: entry.firstSeenAt,
            lastSeenAt: entry.lastSeenAt,
            presentNow: entry.presentNow,
            hasChatted: entry.hasChatted,
            messageCount: entry.messageCount,
            lastChatAt: entry.lastChatAt,
          },
        }),
      ),
    );
  }

  /** Drop everything that isn't today's log (the daily-rollover cleanup). */
  async deleteOtherDays(day: string): Promise<void> {
    await this.db.viewerPresence.deleteMany({ where: { day: { not: day } } });
  }

  async deleteAll(): Promise<void> {
    await this.db.viewerPresence.deleteMany({});
  }
}
