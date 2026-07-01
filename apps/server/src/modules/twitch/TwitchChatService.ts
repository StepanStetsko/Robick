import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "../../core/logger/logger.js";
import { AuthRepository } from "../auth/AuthRepository.js";
import { TwitchApiClient } from "./TwitchApiClient.js";

type ChatAccountsCache = {
  broadcasterUserId: string;
  botUserId: string;
  cachedAt: number;
};

const CHAT_ACCOUNTS_CACHE_TTL_MS = 60 * 1000;

export class TwitchChatService {
  private accountsCache: ChatAccountsCache | null = null;
  private readonly captureStore = new AsyncLocalStorage<string[]>();

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly twitchApiClient: TwitchApiClient,
  ) {}

  /**
   * Runs `fn` with chat output captured instead of sent to Twitch. Any
   * sendMessage call inside (including nested async router calls) is recorded in
   * the returned `messages` array and never hits the API. Used by the admin chat
   * simulator to exercise the real command pipeline safely.
   */
  async runCaptured<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; messages: string[] }> {
    const buffer: string[] = [];
    const result = await this.captureStore.run(buffer, fn);
    return { result, messages: buffer };
  }

  async sendMessage(message: string, replyParentMessageId?: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      throw new Error("Chat message cannot be empty");
    }

    const captureBuffer = this.captureStore.getStore();

    if (captureBuffer) {
      captureBuffer.push(trimmedMessage);
      return { captured: true } as const;
    }

    const accounts = await this.getChatAccounts();

    logger.info("Sending Twitch chat message", {
      broadcasterUserId: accounts.broadcasterUserId,
      senderUserId: accounts.botUserId,
      message: trimmedMessage,
      replyParentMessageId,
    });

    return this.twitchApiClient.sendChatMessage("bot", {
      broadcaster_id: accounts.broadcasterUserId,
      sender_id: accounts.botUserId,
      message: trimmedMessage,
      reply_parent_message_id: replyParentMessageId,
    });
  }

  invalidateAccountsCache() {
    this.accountsCache = null;
  }

  private async getChatAccounts() {
    if (
      this.accountsCache &&
      Date.now() - this.accountsCache.cachedAt < CHAT_ACCOUNTS_CACHE_TTL_MS
    ) {
      return this.accountsCache;
    }

    const [broadcaster, bot] = await Promise.all([
      this.authRepository.findAccountByType("broadcaster"),
      this.authRepository.findAccountByType("bot"),
    ]);

    if (!broadcaster?.providerUserId) {
      throw new Error("Broadcaster account is not connected");
    }

    if (!bot?.providerUserId) {
      throw new Error("Bot account is not connected");
    }

    const result = {
      broadcasterUserId: broadcaster.providerUserId,
      botUserId: bot.providerUserId,
      cachedAt: Date.now(),
    };

    this.accountsCache = result;

    return result;
  }
}