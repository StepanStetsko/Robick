import { EconomyRepository } from "../economy/EconomyRepository.js";

/**
 * "Leader lock" for the roulette gate: the current #1 wallet holder may only
 * play roulette all-in and may not transfer points, until they win an all-in
 * spin once (then they're "cleared"). On a losing all-in they drop from #1 and
 * the lock follows the new leader. In-memory — the cleared set resets on
 * restart (acceptable, it's a soft gameplay gate).
 */
export class LeaderLockService {
  private readonly clearedIds = new Set<string>();

  constructor(private readonly economyRepository: EconomyRepository) {}

  /** Is this viewer the current top-1 and not yet cleared this session? */
  async isLocked(twitchUserId: string): Promise<boolean> {
    if (this.clearedIds.has(twitchUserId)) {
      return false;
    }

    const top = await this.economyRepository.getLeaderboard(1);
    return top[0]?.twitchUserId === twitchUserId;
  }

  /** Mark a viewer as having cleared the gate (won their all-in). */
  markCleared(twitchUserId: string): void {
    this.clearedIds.add(twitchUserId);
  }

  reset(): void {
    this.clearedIds.clear();
  }
}
