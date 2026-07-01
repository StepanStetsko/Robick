import { AuthRepository } from "../../auth/AuthRepository.js";

const CACHE_TTL_MS = 60_000;

/**
 * Resolves the set of twitch user ids excluded from earning currency — the
 * broadcaster and the bot. They should not accumulate balances. Cached with a
 * short TTL since the connected accounts rarely change.
 */
export class EarningExclusionService {
  private cache: { ids: Set<string>; at: number } | null = null;

  constructor(private readonly authRepository: AuthRepository) {}

  async getExcludedIds(): Promise<Set<string>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.ids;
    }

    const [broadcaster, bot] = await Promise.all([
      this.authRepository.findAccountByType("broadcaster"),
      this.authRepository.findAccountByType("bot"),
    ]);

    const ids = new Set<string>();

    if (broadcaster?.providerUserId) {
      ids.add(broadcaster.providerUserId);
    }

    if (bot?.providerUserId) {
      ids.add(bot.providerUserId);
    }

    this.cache = { ids, at: Date.now() };
    return ids;
  }

  async isExcluded(twitchUserId: string): Promise<boolean> {
    return (await this.getExcludedIds()).has(twitchUserId);
  }
}
