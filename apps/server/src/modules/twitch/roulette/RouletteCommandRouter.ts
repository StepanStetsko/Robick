import { logger } from "../../../core/logger/logger.js";
import { RateLimitService } from "../guards/RateLimitService.js";
import type { TwitchChatService } from "../TwitchChatService.js";
import type { TwitchChatMessageEvent } from "../twitch.types.js";
import { EconomyService } from "../economy/EconomyService.js";
import { BuffService } from "../buffs/BuffService.js";
import { LeaderLockService } from "./LeaderLockService.js";

const COMMAND_PREFIX = "!";
const MIN_EFFECTIVE_CHANCE = 0.05;
const MAX_EFFECTIVE_CHANCE = 0.95;

type ParsedCommand = {
  commandName: string;
  args: string[];
};

type Settings = Awaited<ReturnType<EconomyService["getSettings"]>>;

type Viewer = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
};

/**
 * Gambling command: `!рулетка <ставка|all|NN%>`. The player bets currency they
 * own; the bet is paid 1:1 by default (win → +bet net via roulettePayoutPercent,
 * loss → forfeit the bet). The win chance is randomized per spin within an admin
 * range (less predictable). A per-user cooldown applies. The current leaderboard
 * #1 is "locked": they may only bet all-in until they win one (LeaderLockService).
 * Active buffs/debuffs shift the outcome (chance → win-chance, guarantee →
 * forced win/lose, multiplier + flat → winnings size).
 */
export class RouletteCommandRouter {
  private readonly rateLimit = new RateLimitService();

  constructor(
    private readonly chatService: TwitchChatService,
    private readonly economyService: EconomyService,
    private readonly buffService: BuffService,
    private readonly leaderLock: LeaderLockService,
  ) {}

  async handle(event: TwitchChatMessageEvent): Promise<boolean> {
    const parsed = this.parse(event.message.text);

    if (!parsed) {
      return false;
    }

    const settings = await this.economyService.getSettings();

    if (parsed.commandName !== settings.rouletteCommand) {
      return false;
    }

    await this.handleRoulette(event, settings, parsed.args[0]);
    return true;
  }

  private async handleRoulette(
    event: TwitchChatMessageEvent,
    settings: Settings,
    rawBet: string | undefined,
  ): Promise<void> {
    const viewer = this.getViewer(event);
    const displayName = viewer.displayName;

    if (!rawBet) {
      await this.send(settings.messages.rouletteNoBet, event, {
        displayName,
        rouletteCommand: settings.rouletteCommand,
      });
      return;
    }

    const balance = await this.economyService.getBalance(viewer.twitchUserId);

    const stake = this.resolveStake(rawBet, balance);

    if (stake === null || stake < settings.rouletteMinBet) {
      await this.send(settings.messages.rouletteInvalidBet, event, {
        displayName,
        minBet: settings.rouletteMinBet,
        unit: settings.unit,
      });
      return;
    }

    if (balance < stake) {
      await this.send(settings.messages.rouletteInsufficient, event, {
        displayName,
        bet: stake,
        balance,
        unit: settings.unit,
      });
      return;
    }

    // Leader lock: the current #1 may only play all-in until they clear it.
    const locked =
      settings.rouletteLeaderLockEnabled &&
      (await this.leaderLock.isLocked(viewer.twitchUserId));

    if (locked && stake !== balance) {
      await this.send(settings.messages.rouletteLeaderMustAllIn, event, {
        displayName,
        rouletteCommand: settings.rouletteCommand,
      });
      return;
    }

    // Cooldown only consumed once we've passed validation (a real spin).
    const cooldown = this.rateLimit.isAllowed(
      `roulette:${viewer.twitchUserId}`,
      settings.rouletteCooldownSec * 1000,
    );

    if (!cooldown.allowed) {
      await this.send(settings.messages.rouletteCooldown, event, {
        displayName,
        secondsLeft: Math.ceil(cooldown.retryAfterMs / 1000),
      });
      return;
    }

    const bet = locked
      ? stake
      : settings.rouletteMaxBet > 0
        ? Math.min(stake, settings.rouletteMaxBet)
        : stake;

    try {
      const modifiers = await this.buffService.resolveRollModifiers(
        viewer.twitchUserId,
      );

      // Randomize the base win chance within the admin range, then apply buffs.
      const lo = Math.min(
        settings.rouletteWinChanceMinPercent,
        settings.rouletteWinChanceMaxPercent,
      );
      const hi = Math.max(
        settings.rouletteWinChanceMinPercent,
        settings.rouletteWinChanceMaxPercent,
      );
      const baseChance = (lo + Math.random() * (hi - lo)) / 100;
      const effectiveChance = Math.min(
        MAX_EFFECTIVE_CHANCE,
        Math.max(MIN_EFFECTIVE_CHANCE, baseChance + modifiers.chanceDelta),
      );

      const won =
        modifiers.forcedDirection !== null
          ? modifiers.forcedDirection === "increase"
          : Math.random() < effectiveChance;

      let newBalance: number;
      let winnings = 0;

      if (won) {
        // 1:1 by default — winnings added to balance (bet is NOT also deducted).
        winnings = Math.max(
          1,
          Math.floor(
            ((bet * settings.roulettePayoutPercent) / 100 + modifiers.flatBonus) *
              modifiers.multiplier,
          ),
        );
        const wallet = await this.economyService.award(
          viewer,
          winnings,
          "roulette",
        );
        newBalance = wallet.balance;
      } else {
        const wallet = await this.economyService.spend(viewer.twitchUserId, bet);
        newBalance = wallet.balance;
      }

      await this.buffService.consumeRollBuffs(viewer.twitchUserId);

      // Clearing the leader gate: a locked leader who wins their all-in is freed.
      if (locked && won) {
        this.leaderLock.markCleared(viewer.twitchUserId);
      }

      const template = won
        ? settings.messages.rouletteWin
        : settings.messages.rouletteLose;

      await this.send(template, event, {
        displayName,
        bet,
        winnings,
        balance: newBalance,
        unit: settings.unit,
      });
    } catch (error) {
      logger.error("Roulette command failed", {
        userLogin: viewer.userLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Resolve a bet argument to an amount: a plain number, `all`/`всі` (whole
   * balance), or `NN%` (percent of balance). Returns null if unparseable.
   */
  private resolveStake(rawBet: string, balance: number): number | null {
    const value = rawBet.trim().toLocaleLowerCase();

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

  private async send(
    template: string,
    event: TwitchChatMessageEvent,
    values: Record<string, unknown>,
  ): Promise<void> {
    await this.chatService.sendMessage(
      this.renderTemplate(template, values),
      event.message_id,
    );
  }

  private parse(messageText: string): ParsedCommand | null {
    const trimmed = messageText.trim();

    if (!trimmed.startsWith(COMMAND_PREFIX)) {
      return null;
    }

    const withoutPrefix = trimmed.slice(COMMAND_PREFIX.length).trim();

    if (!withoutPrefix) {
      return null;
    }

    const [rawCommandName, ...rawArgs] = withoutPrefix.split(/\s+/);
    const commandName = rawCommandName?.toLocaleLowerCase();

    if (!commandName) {
      return null;
    }

    return {
      commandName,
      args: rawArgs,
    };
  }

  private getViewer(event: TwitchChatMessageEvent): Viewer {
    return {
      twitchUserId: event.chatter_user_id,
      userLogin: event.chatter_user_login,
      displayName: event.chatter_user_name || event.chatter_user_login,
    };
  }

  private renderTemplate(
    template: string,
    values: Record<string, unknown>,
  ): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];

      if (value === undefined || value === null) {
        return match;
      }

      return String(value);
    });
  }
}
