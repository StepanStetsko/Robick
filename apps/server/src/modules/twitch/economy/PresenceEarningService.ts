import { logger } from "../../../core/logger/logger.js";
import { AuthRepository } from "../../auth/AuthRepository.js";
import { TwitchApiClient } from "../TwitchApiClient.js";
import { ChatActivityTracker } from "./ChatActivityTracker.js";
import { EconomyService } from "./EconomyService.js";
import { BuffService } from "../buffs/BuffService.js";
import { PresenceTracker } from "./PresenceTracker.js";
import { PresenceLogService } from "./PresenceLogService.js";
import { EarningExclusionService } from "./EarningExclusionService.js";
import { TwitchRuntimeState } from "../runtime/TwitchRuntimeState.js";
import { SupporterService } from "../supporter/SupporterService.js";

const DEFAULT_INTERVAL_MIN = 5;

/**
 * Periodically polls Helix "Get Chatters" and awards presence points to every
 * present viewer. Lurkers (present but not chatting within the inactivity
 * window) earn a reduced amount based on lurkerReductionPercent.
 *
 * Lifecycle is tied to the runtime: start()/stop() are called from
 * TwitchRuntimeService. The reschedule timer is always cleared on stop().
 */
export class PresenceEarningService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastIntervalMin = DEFAULT_INTERVAL_MIN;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly twitchApiClient: TwitchApiClient,
    private readonly economyService: EconomyService,
    private readonly activityTracker: ChatActivityTracker,
    private readonly buffService: BuffService,
    private readonly presenceTracker: PresenceTracker,
    private readonly presenceLog: PresenceLogService,
    private readonly earningExclusion: EarningExclusionService,
    private readonly runtimeState: TwitchRuntimeState,
    private readonly supporterService: SupporterService,
  ) {}

  /**
   * Poll Get Chatters immediately and refresh the presence snapshot + log,
   * WITHOUT awarding points (used by the admin presence page refresh button).
   */
  async pollNow(): Promise<void> {
    await this.pollChatters();
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    logger.info("Presence earning service started");
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    logger.info("Presence earning service stopped");
  }

  private scheduleNext(): void {
    if (!this.running) {
      return;
    }

    const intervalMs = Math.max(1, this.lastIntervalMin) * 60_000;
    this.timer = setTimeout(() => void this.runCycle(), intervalMs);
  }

  private async runCycle(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const settings = await this.economyService.getSettings();
      this.lastIntervalMin = settings.presenceIntervalMin;

      // No automatic earning / presence stats while the stream is offline.
      // (Manual "poll now" from the admin still works via pollNow().)
      if (!this.runtimeState.isStreamLive()) {
        this.scheduleNext();
        return;
      }

      // Always poll so the presence snapshot (used by the steal mechanic) stays
      // fresh even when presence earning is disabled (presencePointsPerTick=0).
      await this.tick(settings);
    } catch (error) {
      logger.error("Presence earning cycle failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.scheduleNext();
  }

  /** Poll Get Chatters and refresh the presence snapshot + session log. */
  private async pollChatters(): Promise<
    Array<{ user_id: string; user_login: string; user_name: string }>
  > {
    const broadcaster = await this.authRepository.findAccountByType("broadcaster");

    if (!broadcaster) {
      return [];
    }

    const chatters = await this.twitchApiClient.getChatters(
      broadcaster.providerUserId,
    );

    this.presenceTracker.setPresent(chatters.map((chatter) => chatter.user_id));
    this.presenceLog.recordPresent(chatters);

    return chatters;
  }

  private async tick(
    settings: Awaited<ReturnType<EconomyService["getSettings"]>>,
  ): Promise<void> {
    const chatters = await this.pollChatters();

    // Advance presence streaks (drives the free `loyal` tier) regardless of
    // whether presence points are enabled — being here means the stream is live.
    await this.supporterService.notePresence(chatters);

    if (chatters.length === 0 || settings.presencePointsPerTick <= 0) {
      return;
    }

    const inactivityMs = settings.lurkerInactivityMin * 60_000;
    const fullAmount = settings.presencePointsPerTick;
    const lurkerAmount = Math.floor(
      fullAmount * (1 - settings.lurkerReductionPercent / 100),
    );

    const multipliers = await this.buffService.resolveEarningMultipliers(
      chatters.map((chatter) => chatter.user_id),
    );

    // Broadcaster and bot are present in chatters but must not earn.
    const excluded = await this.earningExclusion.getExcludedIds();

    let awarded = 0;

    for (const chatter of chatters) {
      if (excluded.has(chatter.user_id)) {
        continue;
      }

      const isLurker = this.activityTracker.isLurker(
        chatter.user_id,
        inactivityMs,
      );
      const baseAmount = isLurker ? lurkerAmount : fullAmount;
      const multiplier = multipliers.get(chatter.user_id) ?? 1;
      const perks = await this.supporterService.resolvePerks(
        chatter.user_login,
      );
      const amount = Math.floor(baseAmount * multiplier * perks.earnMultiplier);

      if (amount <= 0) {
        continue;
      }

      try {
        await this.economyService.award(
          {
            twitchUserId: chatter.user_id,
            userLogin: chatter.user_login,
            displayName: chatter.user_name,
          },
          amount,
          "presence",
        );
        awarded += 1;
      } catch (error) {
        logger.error("Presence award failed", {
          userId: chatter.user_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.activityTracker.prune(Math.max(inactivityMs * 4, 3_600_000));

    logger.info("Presence earning tick complete", {
      present: chatters.length,
      awarded,
    });
  }
}
