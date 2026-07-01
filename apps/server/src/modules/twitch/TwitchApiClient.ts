import { env } from "../../config/env.js";
import { logger } from "../../core/logger/logger.js";
import type { AuthAccountType } from "../auth/auth.types.js";
import { TokenManagerService } from "../auth/TokenManagerService.js";

type CreateEventSubSubscriptionRequest = {
  type: string;
  version: string;
  condition: Record<string, string>;
  transport: {
    method: "websocket";
    session_id: string;
  };
};

export type TwitchCustomReward = {
  id: string;
  title: string;
  prompt: string;
  cost: number;
  background_color: string | null;
  is_enabled: boolean;
  is_paused: boolean;
  is_in_stock: boolean;
  cooldown_expires_at: string | null;
};

type SendChatMessageRequest = {
  broadcaster_id: string;
  sender_id: string;
  message: string;
  reply_parent_message_id?: string;
};

export class TwitchApiClient {
  constructor(private readonly tokenManager: TokenManagerService) {}

  async createEventSubSubscription(
    accountType: AuthAccountType,
    body: CreateEventSubSubscriptionRequest,
  ) {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const token = await this.tokenManager.getValidAccessToken(accountType);

    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    logger.info("Twitch EventSub create subscription response", {
      accountType,
      status: response.status,
      body: text,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create EventSub subscription: ${response.status} ${text}`,
      );
    }

    return JSON.parse(text);
  }


  async getCustomRewards(accountType: AuthAccountType, broadcasterId: string) {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const token = await this.tokenManager.getValidAccessToken(accountType);
    const url = new URL("https://api.twitch.tv/helix/channel_points/custom_rewards");
    url.searchParams.set("broadcaster_id", broadcasterId);
    url.searchParams.set("only_manageable_rewards", "false");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
    });

    const text = await response.text();

    logger.info("Twitch get custom rewards response", {
      accountType,
      broadcasterId,
      status: response.status,
      body: text,
    });

    if (!response.ok) {
      throw new Error(`Failed to load custom rewards: ${response.status} ${text}`);
    }

    const parsed = JSON.parse(text) as { data?: TwitchCustomReward[] };

    return Array.isArray(parsed.data) ? parsed.data : [];
  }

  async getChatters(
    broadcasterId: string,
  ): Promise<Array<{ user_id: string; user_login: string; user_name: string }>> {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const token = await this.tokenManager.getValidAccessToken("broadcaster");
    const chatters: Array<{
      user_id: string;
      user_login: string;
      user_name: string;
    }> = [];

    let cursor: string | undefined;
    let pages = 0;

    do {
      const url = new URL("https://api.twitch.tv/helix/chat/chatters");
      url.searchParams.set("broadcaster_id", broadcasterId);
      url.searchParams.set("moderator_id", broadcasterId);
      url.searchParams.set("first", "1000");

      if (cursor) {
        url.searchParams.set("after", cursor);
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Client-Id": env.TWITCH_CLIENT_ID,
        },
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(`Failed to load chatters: ${response.status} ${text}`);
      }

      const parsed = JSON.parse(text) as {
        data?: Array<{
          user_id: string;
          user_login: string;
          user_name: string;
        }>;
        pagination?: { cursor?: string };
      };

      if (Array.isArray(parsed.data)) {
        chatters.push(...parsed.data);
      }

      cursor = parsed.pagination?.cursor;
      pages += 1;
    } while (cursor && pages < 10);

    return chatters;
  }

  /** Is the broadcaster currently live? (Helix Get Streams.) */
  async getStreamLive(broadcasterId: string): Promise<boolean> {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const token = await this.tokenManager.getValidAccessToken("broadcaster");
    const url = new URL("https://api.twitch.tv/helix/streams");
    url.searchParams.set("user_id", broadcasterId);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Failed to load stream status: ${response.status} ${text}`);
    }

    const parsed = JSON.parse(text) as {
      data?: Array<{ type?: string }>;
    };

    return (parsed.data ?? []).some((stream) => stream.type === "live");
  }

  /** Resolve a single login to a Twitch user (Helix Get Users). */
  async getUserByLogin(
    login: string,
  ): Promise<{ id: string; login: string; display_name: string } | null> {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const normalized = login.trim().replace(/^@/, "").toLocaleLowerCase();

    if (!normalized) {
      return null;
    }

    const token = await this.tokenManager.getValidAccessToken("broadcaster");
    const url = new URL("https://api.twitch.tv/helix/users");
    url.searchParams.set("login", normalized);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Failed to load user: ${response.status} ${text}`);
    }

    const parsed = JSON.parse(text) as {
      data?: Array<{ id: string; login: string; display_name: string }>;
    };

    return parsed.data?.[0] ?? null;
  }

  async sendChatMessage(
    accountType: AuthAccountType,
    body: SendChatMessageRequest,
  ) {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const token = await this.tokenManager.getValidAccessToken(accountType);

    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    logger.info("Twitch send chat message response", {
      accountType,
      status: response.status,
      body: text,
    });

    if (!response.ok) {
      throw new Error(`Failed to send chat message: ${response.status} ${text}`);
    }

    return JSON.parse(text);
  }
}