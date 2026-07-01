import { logger } from "../../../core/logger/logger.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import { EconomyService } from "../economy/EconomyService.js";

type Settings = Awaited<ReturnType<EconomyService["getSettings"]>>;

export type FightViewer = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
};

type PendingFight = {
  challenger: FightViewer;
  target: FightViewer;
  stake: number;
  timer: NodeJS.Timeout;
};

/**
 * PvP "fight" for points (challenge + accept). `!бійка @нік <ставка>` registers
 * a pending challenge and tags the target; the target writes the accept command
 * to resolve. A random winner (base fightWinChancePercent for the challenger)
 * takes the stake from the loser (zero-sum transfer). Unaccepted challenges
 * expire after fightChallengeTimeoutSec.
 */
export class FightService {
  private readonly rateLimit = new RateLimitService();
  // Keyed by target id — the accepter resolves the challenge aimed at them.
  private readonly pending = new Map<string, PendingFight>();

  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
  ) {}

  async requestFight(
    challenger: FightViewer,
    target: FightViewer | null,
    rawStake: string | undefined,
    settings: Settings,
    replyMessageId: string,
  ): Promise<void> {
    const m = settings.messages;

    if (!target) {
      await this.reply(
        m.fightNoTarget,
        { displayName: challenger.displayName, fightCommand: settings.fightCommand },
        replyMessageId,
      );
      return;
    }

    if (target.twitchUserId === challenger.twitchUserId) {
      await this.reply(m.fightSelf, { displayName: challenger.displayName }, replyMessageId);
      return;
    }

    if (this.pending.has(target.twitchUserId) || this.pending.has(challenger.twitchUserId)) {
      await this.reply(m.fightBusy, { displayName: challenger.displayName }, replyMessageId);
      return;
    }

    const cooldown = this.rateLimit.isAllowed(
      `fight:${challenger.twitchUserId}`,
      settings.fightCooldownSec * 1000,
    );

    if (!cooldown.allowed) {
      await this.reply(
        m.fightCooldown,
        { displayName: challenger.displayName, secondsLeft: Math.ceil(cooldown.retryAfterMs / 1000) },
        replyMessageId,
      );
      return;
    }

    const challengerBalance = await this.economyService.getBalance(challenger.twitchUserId);
    const stake = this.resolveStake(rawStake, challengerBalance);

    if (stake === null || stake < settings.fightMinBet) {
      await this.reply(
        m.fightNoTarget,
        { displayName: challenger.displayName, fightCommand: settings.fightCommand },
        replyMessageId,
      );
      return;
    }

    const cappedStake =
      settings.fightMaxBet > 0 ? Math.min(stake, settings.fightMaxBet) : stake;

    if (challengerBalance < cappedStake) {
      await this.reply(
        m.fightInsufficient,
        { displayName: challenger.displayName, stake: cappedStake, balance: challengerBalance, unit: settings.unit },
        replyMessageId,
      );
      return;
    }

    const targetBalance = await this.economyService.getBalance(target.twitchUserId);

    if (targetBalance < cappedStake) {
      await this.reply(
        m.fightInsufficient,
        { displayName: target.displayName, stake: cappedStake, balance: targetBalance, unit: settings.unit },
        replyMessageId,
      );
      return;
    }

    const timer = setTimeout(() => {
      const current = this.pending.get(target.twitchUserId);
      if (current && current.challenger.twitchUserId === challenger.twitchUserId) {
        this.pending.delete(target.twitchUserId);
        void this.chatService.sendMessage(
          this.render(m.fightExpired, {
            challengerName: challenger.displayName,
            targetName: target.displayName,
          }),
        );
      }
    }, settings.fightChallengeTimeoutSec * 1000);

    this.pending.set(target.twitchUserId, { challenger, target, stake: cappedStake, timer });

    await this.chatService.sendMessage(
      this.render(m.fightChallenge, {
        challengerName: challenger.displayName,
        targetName: target.displayName,
        stake: cappedStake,
        unit: settings.unit,
        fightAcceptCommand: settings.fightAcceptCommand,
        seconds: settings.fightChallengeTimeoutSec,
      }),
    );
  }

  /** The target accepts the challenge aimed at them — resolves the fight. */
  async accept(accepter: FightViewer, settings: Settings): Promise<void> {
    const fight = this.pending.get(accepter.twitchUserId);

    if (!fight) {
      return;
    }

    this.pending.delete(accepter.twitchUserId);
    clearTimeout(fight.timer);

    const m = settings.messages;

    try {
      const challengerWins = Math.random() * 100 < settings.fightWinChancePercent;
      const winner = challengerWins ? fight.challenger : fight.target;
      const loser = challengerWins ? fight.target : fight.challenger;

      const loserBalance = await this.economyService.getBalance(loser.twitchUserId);
      const stake = Math.min(fight.stake, loserBalance);

      await this.chatService.sendMessage(
        this.render(m.fightAccepted, {
          challengerName: fight.challenger.displayName,
          targetName: fight.target.displayName,
          stake: fight.stake,
          unit: settings.unit,
        }),
      );

      if (stake < 1) {
        return;
      }

      const result = await this.economyService.transfer(
        { twitchUserId: loser.twitchUserId, userLogin: loser.userLogin, displayName: loser.displayName },
        { twitchUserId: winner.twitchUserId, userLogin: winner.userLogin, displayName: winner.displayName },
        stake,
      );

      await this.chatService.sendMessage(
        this.render(m.fightWin, {
          winnerName: winner.displayName,
          loserName: loser.displayName,
          stake,
          unit: settings.unit,
          balance: result.to.balance,
        }),
      );
    } catch (error) {
      logger.error("Fight resolution failed", {
        challenger: fight.challenger.userLogin,
        target: fight.target.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  hasPendingFor(accepterId: string): boolean {
    return this.pending.has(accepterId);
  }

  stop(): void {
    for (const fight of this.pending.values()) {
      clearTimeout(fight.timer);
    }
    this.pending.clear();
  }

  private resolveStake(rawStake: string | undefined, balance: number): number | null {
    if (!rawStake) {
      return null;
    }

    const value = rawStake.trim().toLocaleLowerCase();

    if (value === "all" || value === "всі" || value === "все") {
      return balance;
    }

    const percentMatch = value.match(/^(\d+)%$/);

    if (percentMatch) {
      const percent = Number.parseInt(percentMatch[1]!, 10);
      if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
        return null;
      }
      return Math.floor((balance * percent) / 100);
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || String(parsed) !== value || parsed < 1) {
      return null;
    }

    return parsed;
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
