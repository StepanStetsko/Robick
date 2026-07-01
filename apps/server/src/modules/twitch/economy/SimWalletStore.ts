import type { ViewerWallet } from "../../../generated/prisma/client.js";
import type { EconomyViewerInput } from "./economy.types.js";

/**
 * In-memory wallet store for simulator users (twitchUserId starting with
 * "sim:"). Keeps simulated economy changes local to the running process — they
 * never touch the DB, never appear in the real leaderboard, and reset on
 * restart. EconomyRepository routes "sim:" ids here.
 */
export class SimWalletStore {
  private readonly wallets = new Map<string, ViewerWallet>();

  static isSimId(twitchUserId: string): boolean {
    return twitchUserId.startsWith("sim:");
  }

  get(twitchUserId: string): ViewerWallet | null {
    return this.wallets.get(twitchUserId) ?? null;
  }

  credit(viewer: EconomyViewerInput, amount: number): ViewerWallet {
    const existing = this.wallets.get(viewer.twitchUserId);
    const now = new Date();

    const next: ViewerWallet = existing
      ? {
          ...existing,
          userLogin: viewer.userLogin,
          displayName: viewer.displayName ?? null,
          balance: existing.balance + amount,
          earnedTotal: existing.earnedTotal + amount,
          updatedAt: now,
        }
      : {
          id: viewer.twitchUserId,
          twitchUserId: viewer.twitchUserId,
          userLogin: viewer.userLogin,
          displayName: viewer.displayName ?? null,
          balance: amount,
          earnedTotal: amount,
          createdAt: now,
          updatedAt: now,
        };

    this.wallets.set(viewer.twitchUserId, next);
    return next;
  }

  debit(twitchUserId: string, amount: number): ViewerWallet {
    const existing = this.wallets.get(twitchUserId);

    if (!existing || existing.balance < amount) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const next: ViewerWallet = {
      ...existing,
      balance: existing.balance - amount,
      updatedAt: new Date(),
    };

    this.wallets.set(twitchUserId, next);
    return next;
  }

  transfer(
    fromTwitchUserId: string,
    toViewer: EconomyViewerInput,
    amount: number,
  ): { from: ViewerWallet; to: ViewerWallet } {
    const from = this.debit(fromTwitchUserId, amount);
    const to = this.credit(toViewer, amount);
    // earnedTotal should not count incoming transfers (mirror DB transfer).
    const adjustedTo: ViewerWallet = {
      ...to,
      earnedTotal: Math.max(0, to.earnedTotal - amount),
    };
    this.wallets.set(toViewer.twitchUserId, adjustedTo);
    return { from, to: adjustedTo };
  }
}
