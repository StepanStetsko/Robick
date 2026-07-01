import { logger } from "../../core/logger/logger.js";
import { twitchEventLog } from "./events/twitch-event-log.js";
import { ChatMessageHandler } from "./handlers/ChatMessageHandler.js";
import { RewardRedemptionHandler } from "./handlers/RewardRedemptionHandler.js";
import { TwitchRuntimeState } from "./runtime/TwitchRuntimeState.js";
import type {
  EventSubNotificationMessage,
  TwitchChatMessageEvent,
  TwitchCheerEvent,
  TwitchFollowEvent,
  TwitchRaidEvent,
  TwitchRewardRedemptionEvent,
  TwitchSubscribeEvent,
  TwitchSubscriptionGiftEvent,
  TwitchSubscriptionMessageEvent,
} from "./twitch.types.js";

export class TwitchEventRouter {
  constructor(
    private readonly chatMessageHandler: ChatMessageHandler,
    private readonly rewardRedemptionHandler: RewardRedemptionHandler,
    private readonly runtimeState: TwitchRuntimeState,
  ) {}

  async handleNotification(message: EventSubNotificationMessage) {
    const subscriptionType = message.payload.subscription.type;

    logger.info("Twitch notification received", {
      subscriptionType,
    });

    switch (subscriptionType) {
      case "channel.chat.message":
        await this.chatMessageHandler.handle(
          message.payload.event as TwitchChatMessageEvent,
        );
        return;

      case "channel.channel_points_custom_reward_redemption.add":
        await this.rewardRedemptionHandler.handle(
          message.payload.event as TwitchRewardRedemptionEvent,
        );
        return;

      case "channel.follow": {
        const event = message.payload.event as TwitchFollowEvent;

        twitchEventLog.add({
          source: "chat",
          type: "channel.follow",
          message: `New follow: ${event.user_login}`,
          data: {
            userId: event.user_id,
            userLogin: event.user_login,
            userName: event.user_name,
            followedAt: event.followed_at,
          },
        });

        console.log("🟣 FOLLOW:", event.user_login);
        return;
      }

      case "channel.subscribe": {
        const event = message.payload.event as TwitchSubscribeEvent;

        twitchEventLog.add({
          source: "chat",
          type: "channel.subscribe",
          message: `New sub: ${event.user_login}`,
          data: {
            userId: event.user_id,
            userLogin: event.user_login,
            userName: event.user_name,
            tier: event.tier,
            isGift: event.is_gift,
          },
        });

        console.log(
          "⭐ SUB:",
          event.user_login,
          "| tier:",
          event.tier,
          "| gift:",
          event.is_gift,
        );
        return;
      }

      case "channel.subscription.message": {
        const event = message.payload.event as TwitchSubscriptionMessageEvent;

        twitchEventLog.add({
          source: "chat",
          type: "channel.subscription.message",
          message: `Resub: ${event.user_login} (${event.cumulative_months} months)`,
          data: {
            userId: event.user_id,
            userLogin: event.user_login,
            userName: event.user_name,
            tier: event.tier,
            cumulativeMonths: event.cumulative_months,
            streakMonths: event.streak_months,
            durationMonths: event.duration_months,
            messageText: event.message?.text ?? "",
          },
        });

        console.log(
          "🔁 RESUB:",
          event.user_login,
          "| months:",
          event.cumulative_months,
          "| streak:",
          event.streak_months,
          "| tier:",
          event.tier,
          "| message:",
          event.message?.text ?? "",
        );
        return;
      }

      case "channel.subscription.gift": {
        const event = message.payload.event as TwitchSubscriptionGiftEvent;

        twitchEventLog.add({
          source: "chat",
          type: "channel.subscription.gift",
          message: `Gift subs: ${event.total}`,
          data: {
            userId: event.user_id,
            userLogin: event.user_login,
            userName: event.user_name,
            total: event.total,
            tier: event.tier,
            cumulativeTotal: event.cumulative_total,
            isAnonymous: event.is_anonymous,
          },
        });

        console.log(
          "🎁 GIFT SUBS:",
          event.user_login ?? "anonymous",
          "| total:",
          event.total,
          "| tier:",
          event.tier,
          "| cumulativeTotal:",
          event.cumulative_total,
        );
        return;
      }

      case "channel.cheer": {
        const event = message.payload.event as TwitchCheerEvent;

        twitchEventLog.add({
          source: "chat",
          type: "channel.cheer",
          message: `Bits received: ${event.bits}`,
          data: {
            userId: event.user_id,
            userLogin: event.user_login,
            userName: event.user_name,
            bits: event.bits,
            messageText: event.message,
            isAnonymous: event.is_anonymous,
          },
        });

        console.log(
          "💎 BITS:",
          event.user_login ?? "anonymous",
          "| bits:",
          event.bits,
          "| message:",
          event.message,
        );
        return;
      }

      case "channel.raid": {
        const event = message.payload.event as TwitchRaidEvent;

        twitchEventLog.add({
          source: "chat",
          type: "channel.raid",
          message: `Raid from ${event.from_broadcaster_user_login}`,
          data: {
            fromBroadcasterUserId: event.from_broadcaster_user_id,
            fromBroadcasterUserLogin: event.from_broadcaster_user_login,
            fromBroadcasterUserName: event.from_broadcaster_user_name,
            toBroadcasterUserId: event.to_broadcaster_user_id,
            toBroadcasterUserLogin: event.to_broadcaster_user_login,
            toBroadcasterUserName: event.to_broadcaster_user_name,
            viewers: event.viewers,
          },
        });

        console.log(
          "🚀 RAID:",
          event.from_broadcaster_user_login,
          "-> viewers:",
          event.viewers,
        );
        return;
      }

      case "stream.online":
        this.runtimeState.setStreamLive(true);
        twitchEventLog.add({
          source: "runtime",
          type: "stream.online",
          message: "Стрім розпочався — нарахування й статистика увімкнені",
        });
        return;

      case "stream.offline":
        this.runtimeState.setStreamLive(false);
        twitchEventLog.add({
          source: "runtime",
          type: "stream.offline",
          message: "Стрім завершився — нарахування й статистика вимкнені",
        });
        return;

      default:
        logger.info("Unhandled Twitch notification", {
          subscriptionType,
        });
    }
  }
}