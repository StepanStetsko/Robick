/**
 * Latest snapshot of viewers present in chat (from the Helix Get Chatters poll
 * in PresenceEarningService). Used by the steal mechanic to only allow robbing
 * viewers who are actually here right now (and idle), not people who left long
 * ago. In-memory; resets on restart (acceptable — it refills on the next poll).
 */
export class PresenceTracker {
  private present = new Set<string>();
  private updatedAt = 0;

  setPresent(twitchUserIds: string[]): void {
    this.present = new Set(twitchUserIds);
    this.updatedAt = Date.now();
  }

  /** Add a single viewer without replacing the snapshot (used by the simulator). */
  addPresent(twitchUserId: string): void {
    this.present.add(twitchUserId);
    this.updatedAt = Date.now();
  }

  isPresent(twitchUserId: string): boolean {
    return this.present.has(twitchUserId);
  }

  get size(): number {
    return this.present.size;
  }

  get lastUpdatedAt(): number {
    return this.updatedAt;
  }
}
