type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
};

export class RateLimitService {
  private readonly entries = new Map<string, number>();

  isAllowed(key: string, cooldownMs: number): RateLimitResult {
    this.cleanup();

    const now = Date.now();
    const nextAllowedAt = this.entries.get(key) ?? 0;

    if (nextAllowedAt > now) {
      return {
        allowed: false,
        retryAfterMs: nextAllowedAt - now,
      };
    }

    this.entries.set(key, now + cooldownMs);

    return {
      allowed: true,
      retryAfterMs: 0,
    };
  }

  private cleanup() {
    const now = Date.now();

    for (const [key, nextAllowedAt] of this.entries.entries()) {
      if (nextAllowedAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}