import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  EconomySettings,
  PrismaClient,
  ViewerWallet,
} from "../../../generated/prisma/client.js";
import { defaultEconomyMessages } from "./economy.messages.js";
import { SimWalletStore } from "./SimWalletStore.js";
import {
  ECONOMY_SETTINGS_KEY,
  type EconomyViewerInput,
  type UpdateEconomySettingsInput,
} from "./economy.types.js";

export class EconomyRepository {
  // Simulator (sim:) wallets live in memory and never hit the DB.
  private readonly simWallets = new SimWalletStore();

  constructor(private readonly db: PrismaClient = prisma) {}

  async getSettingsRow(): Promise<EconomySettings> {
    const existing = await this.db.economySettings.findUnique({
      where: { key: ECONOMY_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.economySettings.create({
      data: {
        key: ECONOMY_SETTINGS_KEY,
        messages: defaultEconomyMessages as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(
    input: UpdateEconomySettingsInput,
  ): Promise<EconomySettings> {
    await this.getSettingsRow();

    return this.db.economySettings.update({
      where: { key: ECONOMY_SETTINGS_KEY },
      data: {
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.chatActivityPoints !== undefined
          ? { chatActivityPoints: input.chatActivityPoints }
          : {}),
        ...(input.chatActivityCooldownSec !== undefined
          ? { chatActivityCooldownSec: input.chatActivityCooldownSec }
          : {}),
        ...(input.presencePointsPerTick !== undefined
          ? { presencePointsPerTick: input.presencePointsPerTick }
          : {}),
        ...(input.presenceIntervalMin !== undefined
          ? { presenceIntervalMin: input.presenceIntervalMin }
          : {}),
        ...(input.lurkerReductionPercent !== undefined
          ? { lurkerReductionPercent: input.lurkerReductionPercent }
          : {}),
        ...(input.lurkerInactivityMin !== undefined
          ? { lurkerInactivityMin: input.lurkerInactivityMin }
          : {}),
        ...(input.balanceCommand !== undefined
          ? { balanceCommand: input.balanceCommand }
          : {}),
        ...(input.topCommand !== undefined
          ? { topCommand: input.topCommand }
          : {}),
        ...(input.giveCommand !== undefined
          ? { giveCommand: input.giveCommand }
          : {}),
        ...(input.buffListCommand !== undefined
          ? { buffListCommand: input.buffListCommand }
          : {}),
        ...(input.buffRollCommand !== undefined
          ? { buffRollCommand: input.buffRollCommand }
          : {}),
        ...(input.buffRollCost !== undefined
          ? { buffRollCost: input.buffRollCost }
          : {}),
        ...(input.buffRollCooldownSec !== undefined
          ? { buffRollCooldownSec: input.buffRollCooldownSec }
          : {}),
        ...(input.buffRollChancePercent !== undefined
          ? { buffRollChancePercent: input.buffRollChancePercent }
          : {}),
        ...(input.rouletteCommand !== undefined
          ? { rouletteCommand: input.rouletteCommand }
          : {}),
        ...(input.rouletteWinChancePercent !== undefined
          ? { rouletteWinChancePercent: input.rouletteWinChancePercent }
          : {}),
        ...(input.rouletteWinChanceMinPercent !== undefined
          ? { rouletteWinChanceMinPercent: input.rouletteWinChanceMinPercent }
          : {}),
        ...(input.rouletteWinChanceMaxPercent !== undefined
          ? { rouletteWinChanceMaxPercent: input.rouletteWinChanceMaxPercent }
          : {}),
        ...(input.roulettePayoutPercent !== undefined
          ? { roulettePayoutPercent: input.roulettePayoutPercent }
          : {}),
        ...(input.rouletteCooldownSec !== undefined
          ? { rouletteCooldownSec: input.rouletteCooldownSec }
          : {}),
        ...(input.rouletteLeaderLockEnabled !== undefined
          ? { rouletteLeaderLockEnabled: input.rouletteLeaderLockEnabled }
          : {}),
        ...(input.rouletteMinBet !== undefined
          ? { rouletteMinBet: input.rouletteMinBet }
          : {}),
        ...(input.rouletteMaxBet !== undefined
          ? { rouletteMaxBet: input.rouletteMaxBet }
          : {}),
        ...(input.stealCommand !== undefined
          ? { stealCommand: input.stealCommand }
          : {}),
        ...(input.stealChancePercent !== undefined
          ? { stealChancePercent: input.stealChancePercent }
          : {}),
        ...(input.stealMinPercent !== undefined
          ? { stealMinPercent: input.stealMinPercent }
          : {}),
        ...(input.stealMaxPercent !== undefined
          ? { stealMaxPercent: input.stealMaxPercent }
          : {}),
        ...(input.stealMaxAmount !== undefined
          ? { stealMaxAmount: input.stealMaxAmount }
          : {}),
        ...(input.stealVictimFloor !== undefined
          ? { stealVictimFloor: input.stealVictimFloor }
          : {}),
        ...(input.stealThiefCooldownSec !== undefined
          ? { stealThiefCooldownSec: input.stealThiefCooldownSec }
          : {}),
        ...(input.stealVictimImmunitySec !== undefined
          ? { stealVictimImmunitySec: input.stealVictimImmunitySec }
          : {}),
        ...(input.stealFinePercent !== undefined
          ? { stealFinePercent: input.stealFinePercent }
          : {}),
        ...(input.stealWarnSeconds !== undefined
          ? { stealWarnSeconds: input.stealWarnSeconds }
          : {}),
        ...(input.shieldCommand !== undefined
          ? { shieldCommand: input.shieldCommand }
          : {}),
        ...(input.shieldCost !== undefined
          ? { shieldCost: input.shieldCost }
          : {}),
        ...(input.shieldDurationMin !== undefined
          ? { shieldDurationMin: input.shieldDurationMin }
          : {}),
        ...(input.fightCommand !== undefined
          ? { fightCommand: input.fightCommand }
          : {}),
        ...(input.fightAcceptCommand !== undefined
          ? { fightAcceptCommand: input.fightAcceptCommand }
          : {}),
        ...(input.fightWinChancePercent !== undefined
          ? { fightWinChancePercent: input.fightWinChancePercent }
          : {}),
        ...(input.fightCooldownSec !== undefined
          ? { fightCooldownSec: input.fightCooldownSec }
          : {}),
        ...(input.fightChallengeTimeoutSec !== undefined
          ? { fightChallengeTimeoutSec: input.fightChallengeTimeoutSec }
          : {}),
        ...(input.fightMinBet !== undefined
          ? { fightMinBet: input.fightMinBet }
          : {}),
        ...(input.fightMaxBet !== undefined
          ? { fightMaxBet: input.fightMaxBet }
          : {}),
        ...(input.statusCommand !== undefined
          ? { statusCommand: input.statusCommand }
          : {}),
        ...(input.helpCommand !== undefined
          ? { helpCommand: input.helpCommand }
          : {}),
        ...(input.messages !== undefined
          ? { messages: input.messages as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async findWallet(twitchUserId: string): Promise<ViewerWallet | null> {
    if (SimWalletStore.isSimId(twitchUserId)) {
      return this.simWallets.get(twitchUserId);
    }

    return this.db.viewerWallet.findUnique({
      where: { twitchUserId },
    });
  }

  async findWalletByLogin(userLogin: string): Promise<ViewerWallet | null> {
    return this.db.viewerWallet.findFirst({
      where: { userLogin: { equals: userLogin, mode: "insensitive" } },
    });
  }

  async creditWallet(
    viewer: EconomyViewerInput,
    amount: number,
  ): Promise<ViewerWallet> {
    if (SimWalletStore.isSimId(viewer.twitchUserId)) {
      return this.simWallets.credit(viewer, amount);
    }

    return this.db.viewerWallet.upsert({
      where: { twitchUserId: viewer.twitchUserId },
      update: {
        userLogin: viewer.userLogin,
        displayName: viewer.displayName ?? null,
        balance: { increment: amount },
        earnedTotal: { increment: amount },
      },
      create: {
        twitchUserId: viewer.twitchUserId,
        userLogin: viewer.userLogin,
        displayName: viewer.displayName ?? null,
        balance: amount,
        earnedTotal: amount,
      },
    });
  }

  async debitWallet(
    twitchUserId: string,
    amount: number,
  ): Promise<ViewerWallet> {
    if (SimWalletStore.isSimId(twitchUserId)) {
      return this.simWallets.debit(twitchUserId, amount);
    }

    return this.db.$transaction(async (tx) => {
      // Atomic guard: the conditional updateMany decrements only if the balance
      // still covers the amount, so two concurrent debits can't both pass a
      // stale read and overdraw the wallet (no TOCTOU / double-spend).
      const result = await tx.viewerWallet.updateMany({
        where: { twitchUserId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });

      if (result.count === 0) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      const wallet = await tx.viewerWallet.findUnique({
        where: { twitchUserId },
      });

      if (!wallet) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      return wallet;
    });
  }

  async transfer(
    fromTwitchUserId: string,
    toViewer: EconomyViewerInput,
    amount: number,
  ): Promise<{ from: ViewerWallet; to: ViewerWallet }> {
    // Simulator transfers (steal fine, !передати, fights) are always sim<->sim.
    if (
      SimWalletStore.isSimId(fromTwitchUserId) ||
      SimWalletStore.isSimId(toViewer.twitchUserId)
    ) {
      return this.simWallets.transfer(fromTwitchUserId, toViewer, amount);
    }

    return this.db.$transaction(async (tx) => {
      // Atomic guard (same as debitWallet): decrement only if funds still cover
      // the amount, so concurrent transfers/spends can't overdraw the sender.
      const debited = await tx.viewerWallet.updateMany({
        where: { twitchUserId: fromTwitchUserId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });

      if (debited.count === 0) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      const updatedFrom = await tx.viewerWallet.findUnique({
        where: { twitchUserId: fromTwitchUserId },
      });

      if (!updatedFrom) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      const to = await tx.viewerWallet.upsert({
        where: { twitchUserId: toViewer.twitchUserId },
        update: {
          userLogin: toViewer.userLogin,
          displayName: toViewer.displayName ?? null,
          balance: { increment: amount },
        },
        create: {
          twitchUserId: toViewer.twitchUserId,
          userLogin: toViewer.userLogin,
          displayName: toViewer.displayName ?? null,
          balance: amount,
          earnedTotal: 0,
        },
      });

      return { from: updatedFrom, to };
    });
  }

  async getLeaderboard(limit: number): Promise<ViewerWallet[]> {
    return this.db.viewerWallet.findMany({
      orderBy: [{ balance: "desc" }, { updatedAt: "asc" }],
      take: limit,
    });
  }

  async getWalletsPage(params: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ entries: ViewerWallet[]; total: number }> {
    const search = params.search?.trim();
    const where: Prisma.ViewerWalletWhereInput | undefined = search
      ? {
          OR: [
            { userLogin: { contains: search, mode: "insensitive" } },
            { displayName: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined;

    const [entries, total] = await this.db.$transaction([
      this.db.viewerWallet.findMany({
        where,
        orderBy: [{ balance: "desc" }, { updatedAt: "asc" }],
        skip: params.offset,
        take: params.limit,
      }),
      this.db.viewerWallet.count({ where }),
    ]);

    return { entries, total };
  }

  async deleteWallet(twitchUserId: string): Promise<boolean> {
    // Operates on the DB list (which is what the admin sees). Legacy "sim:" rows
    // left over from before sim wallets went in-memory are removable here too.
    const result = await this.db.viewerWallet.deleteMany({
      where: { twitchUserId },
    });

    return result.count > 0;
  }

  /** Remove legacy simulator wallets (twitchUserId starting with "sim:") from the DB. */
  async deleteSimWallets(): Promise<number> {
    const result = await this.db.viewerWallet.deleteMany({
      where: { twitchUserId: { startsWith: "sim:" } },
    });

    return result.count;
  }

  async getRank(balance: number): Promise<number> {
    const higher = await this.db.viewerWallet.count({
      where: { balance: { gt: balance } },
    });

    return higher + 1;
  }
}
