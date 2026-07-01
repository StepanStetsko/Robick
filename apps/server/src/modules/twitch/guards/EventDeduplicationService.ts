export class EventDeduplicationService {
  private readonly processed = new Map<string, number>();

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  isDuplicate(eventId: string): boolean {
    this.cleanup();

    const now = Date.now();
    const expiresAt = this.processed.get(eventId);

    if (expiresAt && expiresAt > now) {
      return true;
    }

    this.processed.set(eventId, now + this.ttlMs);
    return false;
  }

  private cleanup() {
    const now = Date.now();

    for (const [eventId, expiresAt] of this.processed.entries()) {
      if (expiresAt <= now) {
        this.processed.delete(eventId);
      }
    }
  }
}