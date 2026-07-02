import { logger } from "../../../core/logger/logger.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import { ChatActivityTracker } from "../economy/ChatActivityTracker.js";
import { PresenceTracker } from "../economy/PresenceTracker.js";
import { EconomyService } from "../economy/EconomyService.js";
import { BuffService } from "../buffs/BuffService.js";
import { ProtectionRepository } from "./ProtectionRepository.js";

type Settings = Awaited<ReturnType<EconomyService["getSettings"]>>;

export type StealViewer = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
};

export type ShieldOutcome =
  | { kind: "bought"; minutes: number; balance: number }
  | { kind: "already_active"; secondsLeft: number }
  | { kind: "insufficient"; cost: number; balance: number };

type PendingSteal = {
  thief: StealViewer;
  victim: StealViewer;
  percent: number;
  timer: NodeJS.Timeout;
};

/**
 * Steal mechanic with a warning window. An active viewer targets a present,
 * idle (lurker) viewer; the bot tags the victim and waits `stealWarnSeconds`.
 * If the victim chats (becomes active) or buys a shield within the window, the
 * attempt is foiled and the thief is fined. Otherwise the steal resolves on the
 * chance roll: success transfers a % of the victim's balance to the thief;
 * failure ("caught") fines the thief. The fine is a % of the *thief's* balance,
 * paid to the victim. Zero-sum — no minting. Chance buffs shift the success
 * odds (thief's raise it, victim's defend).
 */
export class StealService {
  private readonly rateLimit = new RateLimitService();
  private readonly victimImmuneUntil = new Map<string, number>();
  private readonly pending = new Map<string, PendingSteal>();

  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
    private readonly activityTracker: ChatActivityTracker,
    private readonly presenceTracker: PresenceTracker,
    private readonly protectionRepository: ProtectionRepository,
    private readonly buffService: BuffService,
  ) {}

  async isProtected(twitchUserId: string): Promise<boolean> {
    const active = await this.protectionRepository.getActive(
      twitchUserId,
      new Date(),
    );
    return active !== null;
  }

  /**
   * Validate a steal attempt and, if valid, tag the victim and arm the warning
   * timer. All chat messaging happens here (or in the deferred resolution).
   */
  async requestSteal(
    thief: StealViewer,
    victim: StealViewer,
    settings: Settings,
    replyMessageId: string,
  ): Promise<void> {
    const m = settings.messages;

    if (victim.twitchUserId === thief.twitchUserId) {
      await this.reply(m.stealSelf, { displayName: thief.displayName }, replyMessageId);
      return;
    }

    const now = Date.now();
    const inactivityMs = settings.lurkerInactivityMin * 60_000;

    if (
      !this.presenceTracker.isPresent(victim.twitchUserId) ||
      !this.activityTracker.isLurker(victim.twitchUserId, inactivityMs)
    ) {
      await this.reply(m.stealTargetUnavailable, { displayName: thief.displayName }, replyMessageId);
      return;
    }

    if (await this.isProtected(victim.twitchUserId)) {
      await this.reply(m.stealShielded, { displayName: thief.displayName }, replyMessageId);
      return;
    }

    const victimBalance = await this.economyService.getBalance(victim.twitchUserId);

    if (victimBalance < settings.stealVictimFloor || victimBalance < 1) {
      await this.reply(m.stealTargetTooPoor, { displayName: thief.displayName }, replyMessageId);
      return;
    }

    if (this.isVictimImmune(victim.twitchUserId, now)) {
      await this.reply(m.stealVictimImmune, { displayName: thief.displayName }, replyMessageId);
      return;
    }

    if (this.pending.has(victim.twitchUserId)) {
      await this.reply(m.stealTargetUnavailable, { displayName: thief.displayName }, replyMessageId);
      return;
    }

    const cooldown = this.rateLimit.isAllowed(
      `steal:thief:${thief.twitchUserId}`,
      settings.stealThiefCooldownSec * 1000,
    );

    if (!cooldown.allowed) {
      await this.reply(
        m.stealCooldown,
        { displayName: thief.displayName, secondsLeft: Math.ceil(cooldown.retryAfterMs / 1000) },
        replyMessageId,
      );
      return;
    }

    // Real attempt — lock the victim from being farmed by repeated attempts.
    this.setVictimImmune(victim.twitchUserId, settings.stealVictimImmunitySec * 1000);

    const percent = this.randomInt(settings.stealMinPercent, settings.stealMaxPercent);
    const warnSeconds = settings.stealWarnSeconds;

    if (warnSeconds <= 0) {
      // No warning window — resolve immediately.
      await this.resolveSteal(thief, victim, percent, settings);
      return;
    }

    const timer = setTimeout(() => {
      this.pending.delete(victim.twitchUserId);
      void this.resolveSteal(thief, victim, percent, settings);
    }, warnSeconds * 1000);

    this.pending.set(victim.twitchUserId, { thief, victim, percent, timer });

    await this.chatService.sendMessage(
      this.render(m.stealWarning, {
        victimName: victim.displayName,
        thiefName: thief.displayName,
        seconds: warnSeconds,
        shieldCommand: settings.shieldCommand,
      }),
    );
  }

  /** Called for every chat message — if the author had a pending steal on them, they defended. */
  async notifyActivity(twitchUserId: string): Promise<void> {
    const pending = this.pending.get(twitchUserId);

    if (!pending) {
      return;
    }

    this.cancelPending(twitchUserId);
    await this.fineThiefDefended(pending);
  }

  private async resolveSteal(
    thief: StealViewer,
    victim: StealViewer,
    percent: number,
    settings: Settings,
  ): Promise<void> {
    const m = settings.messages;

    try {
      const victimBalance = await this.economyService.getBalance(victim.twitchUserId);

      if (victimBalance < 1) {
        return;
      }

      const stake = Math.min(
        settings.stealMaxAmount,
        victimBalance,
        Math.max(1, Math.floor((victimBalance * percent) / 100)),
      );

      const [thiefMods, victimMods] = await Promise.all([
        this.buffService.resolveGameModifiers(thief.twitchUserId),
        this.buffService.resolveGameModifiers(victim.twitchUserId),
      ]);
      const successPercent = Math.max(
        5,
        Math.min(
          95,
          settings.stealChancePercent +
            thiefMods.chancePoints -
            victimMods.chancePoints,
        ),
      );

      const success = Math.random() * 100 < successPercent;

      if (success) {
        const result = await this.economyService.transfer(victim, thief, stake);
        await this.chatService.sendMessage(
          this.render(m.stealSuccess, {
            thiefName: thief.displayName,
            victimName: victim.displayName,
            amount: stake,
            balance: result.to.balance,
            unit: settings.unit,
          }),
        );
        return;
      }

      // Caught — fine the thief a % of their balance, paid to the victim.
      const { fine, thiefBalance } = await this.fineThief(thief, victim, settings);
      await this.chatService.sendMessage(
        this.render(m.stealFail, {
          thiefName: thief.displayName,
          victimName: victim.displayName,
          fine,
          balance: thiefBalance,
          unit: settings.unit,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        return;
      }

      logger.error("Steal resolution failed", {
        thief: thief.userLogin,
        victim: victim.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async fineThiefDefended(pending: PendingSteal): Promise<void> {
    const settings = await this.economyService.getSettings();

    try {
      const { fine, thiefBalance } = await this.fineThief(
        pending.thief,
        pending.victim,
        settings,
      );
      await this.chatService.sendMessage(
        this.render(settings.messages.stealDefended, {
          thiefName: pending.thief.displayName,
          victimName: pending.victim.displayName,
          fine,
          balance: thiefBalance,
          unit: settings.unit,
        }),
      );
    } catch (error) {
      logger.error("Steal defended fine failed", {
        thief: pending.thief.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Fine the thief stealFinePercent of their balance, transferred to the victim. */
  private async fineThief(
    thief: StealViewer,
    victim: StealViewer,
    settings: Settings,
  ): Promise<{ fine: number; thiefBalance: number }> {
    const thiefBalance = await this.economyService.getBalance(thief.twitchUserId);
    const fine = Math.min(
      thiefBalance,
      Math.floor((thiefBalance * settings.stealFinePercent) / 100),
    );

    if (fine < 1) {
      return { fine: 0, thiefBalance };
    }

    const result = await this.economyService.transfer(thief, victim, fine);
    return { fine, thiefBalance: result.from.balance };
  }

  /** Called when a viewer buys a shield — also foils any pending steal on them. */
  async buyShield(viewer: StealViewer, settings: Settings): Promise<ShieldOutcome> {
    const now = new Date();
    const active = await this.protectionRepository.getActive(viewer.twitchUserId, now);

    if (active) {
      return {
        kind: "already_active",
        secondsLeft: Math.ceil((active.expiresAt.getTime() - now.getTime()) / 1000),
      };
    }

    let balance = await this.economyService.getBalance(viewer.twitchUserId);

    if (settings.shieldCost > 0) {
      try {
        const wallet = await this.economyService.spend(viewer.twitchUserId, settings.shieldCost);
        balance = wallet.balance;
      } catch (error) {
        if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
          return { kind: "insufficient", cost: settings.shieldCost, balance };
        }
        throw error;
      }
    }

    const expiresAt = new Date(now.getTime() + settings.shieldDurationMin * 60_000);
    await this.protectionRepository.upsert(viewer.twitchUserId, viewer.userLogin, expiresAt);

    // Buying a shield mid-window foils the pending steal and fines the thief.
    const pending = this.pending.get(viewer.twitchUserId);
    if (pending) {
      this.cancelPending(viewer.twitchUserId);
      await this.fineThiefDefended(pending);
    }

    return { kind: "bought", minutes: settings.shieldDurationMin, balance };
  }

  /** Clear all pending steal timers (runtime stop). */
  clearPending(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
  }

  private cancelPending(victimId: string): void {
    const pending = this.pending.get(victimId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(victimId);
    }
  }

  private isVictimImmune(twitchUserId: string, now: number): boolean {
    const until = this.victimImmuneUntil.get(twitchUserId);
    return until !== undefined && until > now;
  }

  private setVictimImmune(twitchUserId: string, durationMs: number): void {
    const now = Date.now();

    for (const [id, until] of this.victimImmuneUntil) {
      if (until <= now) {
        this.victimImmuneUntil.delete(id);
      }
    }

    this.victimImmuneUntil.set(twitchUserId, now + durationMs);
  }

  private randomInt(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  private async reply(
    template: string,
    values: Record<string, unknown>,
    replyMessageId: string,
  ): Promise<void> {
    await this.chatService.sendMessage(this.render(template, values), replyMessageId);
  }

  private render(template: string, values: Record<string, unknown>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];
      return value === undefined || value === null ? match : String(value);
    });
  }
}
