/**
 * Tracks the last time each viewer wrote in chat (in-memory).
 * Used to derive lurker state: a present viewer who has not chatted within
 * the inactivity window earns reduced presence points.
 *
 * Bounded by prune(): entries older than the given age are dropped so the
 * map size stays proportional to recently active chatters.
 */
export class ChatActivityTracker {
  private readonly lastChatAt = new Map<string, number>();

  touch(twitchUserId: string): void {
    this.lastChatAt.set(twitchUserId, Date.now());
  }

  getLastChatAt(twitchUserId: string): number | null {
    return this.lastChatAt.get(twitchUserId) ?? null;
  }

  isLurker(twitchUserId: string, inactivityMs: number): boolean {
    const last = this.lastChatAt.get(twitchUserId);
    return last === undefined || Date.now() - last > inactivityMs;
  }

  prune(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;

    for (const [twitchUserId, timestamp] of this.lastChatAt.entries()) {
      if (timestamp < cutoff) {
        this.lastChatAt.delete(twitchUserId);
      }
    }
  }

  get size(): number {
    return this.lastChatAt.size;
  }
}
