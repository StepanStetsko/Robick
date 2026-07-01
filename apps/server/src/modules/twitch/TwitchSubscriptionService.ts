import { logger } from "../../core/logger/logger.js";
import { AuthRepository } from "../auth/AuthRepository.js";
import { TwitchApiClient } from "./TwitchApiClient.js";

export class TwitchSubscriptionService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly twitchApiClient: TwitchApiClient,
  ) {}

  async ensureBotSubscriptions(sessionId: string) {
    const broadcaster = await this.authRepository.findAccountByType("broadcaster");
    const bot = await this.authRepository.findAccountByType("bot");

    if (!broadcaster) {
      throw new Error("Broadcaster account is not connected");
    }

    if (!bot) {
      throw new Error("Bot account is not connected");
    }

    logger.info("Ensuring BOT subscriptions", {
      sessionId,
      broadcasterUserId: broadcaster.providerUserId,
      botUserId: bot.providerUserId,
    });

    const chatSubscription = await this.subscribeToChatMessage({
      sessionId,
      broadcasterUserId: broadcaster.providerUserId,
      userId: bot.providerUserId,
    });

    logger.info("Chat EventSub subscription created", {
      chatSubscription,
    });
  }

  async ensureBroadcasterSubscriptions(sessionId: string) {
    const broadcaster = await this.authRepository.findAccountByType("broadcaster");

    if (!broadcaster) {
      throw new Error("Broadcaster account is not connected");
    }

    logger.info("Ensuring BROADCASTER subscriptions", {
      sessionId,
      broadcasterUserId: broadcaster.providerUserId,
    });

    const results = await Promise.allSettled([
      this.subscribeToChannelPointsRedemption({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
      }),
      this.subscribeToChannelFollow({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
        moderatorUserId: broadcaster.providerUserId,
      }),
      this.subscribeToChannelSubscribe({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
      }),
      this.subscribeToChannelSubscriptionMessage({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
      }),
      this.subscribeToChannelSubscriptionGift({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
      }),
      this.subscribeToChannelCheer({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
      }),
      this.subscribeToChannelRaidTo({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
      }),
      this.subscribeToStreamEvent({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
        type: "stream.online",
      }),
      this.subscribeToStreamEvent({
        sessionId,
        broadcasterUserId: broadcaster.providerUserId,
        type: "stream.offline",
      }),
    ]);

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        logger.info("Broadcaster EventSub subscription created", {
          index,
          subscription: result.value,
        });
        return;
      }

      logger.error("Failed to create broadcaster EventSub subscription", {
        index,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    });
  }

  private async subscribeToChatMessage(params: {
    sessionId: string;
    broadcasterUserId: string;
    userId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.chat.message",
    });

    return this.twitchApiClient.createEventSubSubscription("bot", {
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
        user_id: params.userId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelPointsRedemption(params: {
    sessionId: string;
    broadcasterUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.channel_points_custom_reward_redemption.add",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.channel_points_custom_reward_redemption.add",
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToStreamEvent(params: {
    sessionId: string;
    broadcasterUserId: string;
    type: "stream.online" | "stream.offline";
  }) {
    logger.info("Creating EventSub subscription", { type: params.type });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: params.type,
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelFollow(params: {
    sessionId: string;
    broadcasterUserId: string;
    moderatorUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.follow",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.follow",
      version: "2",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
        moderator_user_id: params.moderatorUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelSubscribe(params: {
    sessionId: string;
    broadcasterUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.subscribe",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.subscribe",
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelSubscriptionMessage(params: {
    sessionId: string;
    broadcasterUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.subscription.message",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.subscription.message",
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelSubscriptionGift(params: {
    sessionId: string;
    broadcasterUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.subscription.gift",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.subscription.gift",
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelCheer(params: {
    sessionId: string;
    broadcasterUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.cheer",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.cheer",
      version: "1",
      condition: {
        broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }

  private async subscribeToChannelRaidTo(params: {
    sessionId: string;
    broadcasterUserId: string;
  }) {
    logger.info("Creating EventSub subscription", {
      type: "channel.raid",
    });

    return this.twitchApiClient.createEventSubSubscription("broadcaster", {
      type: "channel.raid",
      version: "1",
      condition: {
        to_broadcaster_user_id: params.broadcasterUserId,
      },
      transport: {
        method: "websocket",
        session_id: params.sessionId,
      },
    });
  }
}