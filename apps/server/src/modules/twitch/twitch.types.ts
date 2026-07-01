export type EventSubTransport = {
  method: "websocket";
  session_id: string;
};

export type CreateEventSubSubscriptionRequest = {
  type: string;
  version: string;
  condition: Record<string, string>;
  transport: EventSubTransport;
};

export type EventSubWebSocketMessage =
  | EventSubSessionWelcomeMessage
  | EventSubNotificationMessage
  | EventSubSessionKeepaliveMessage
  | EventSubSessionReconnectMessage
  | EventSubRevocationMessage;

export type EventSubMetadata = {
  message_id: string;
  message_type:
    | "session_welcome"
    | "session_keepalive"
    | "notification"
    | "session_reconnect"
    | "revocation";
  message_timestamp: string;
  subscription_type?: string;
  subscription_version?: string;
};

export type EventSubSession = {
  id: string;
  status: string;
  connected_at: string;
  keepalive_timeout_seconds: number;
  reconnect_url: string | null;
};

export type EventSubSubscription = {
  id: string;
  status: string;
  type: string;
  version: string;
  condition: Record<string, string>;
  transport: {
    method: string;
    session_id?: string;
  };
  created_at: string;
};

export type EventSubSessionWelcomeMessage = {
  metadata: EventSubMetadata;
  payload: {
    session: EventSubSession;
  };
};

export type EventSubSessionKeepaliveMessage = {
  metadata: EventSubMetadata;
  payload: Record<string, never>;
};

export type EventSubSessionReconnectMessage = {
  metadata: EventSubMetadata;
  payload: {
    session: EventSubSession;
  };
};

export type EventSubRevocationMessage = {
  metadata: EventSubMetadata;
  payload: {
    subscription: EventSubSubscription;
  };
};

export type EventSubNotificationMessage = {
  metadata: EventSubMetadata;
  payload: {
    subscription: EventSubSubscription;
    event: Record<string, unknown>;
  };
};

export type TwitchChatMessageEvent = {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: {
    text: string;
    fragments: Array<{
      type: string;
      text: string;
      cheermote?: unknown;
      emote?: unknown;
      mention?: unknown;
    }>;
  };
  color?: string;
  badges?: Array<{
    set_id: string;
    id: string;
    info: string;
  }>;
  message_type: string;
};

export type TwitchRewardRedemptionEvent = {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  user_id: string;
  user_login: string;
  user_name: string;
  user_input: string;
  status: string;
  reward: {
    id: string;
    title: string;
    cost: number;
    prompt: string;
  };
  redeemed_at: string;
};

export type TwitchFollowEvent = {
  user_id: string;
  user_login: string;
  user_name: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  followed_at: string;
};

export type TwitchSubscribeEvent = {
  user_id: string;
  user_login: string;
  user_name: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  tier: string;
  is_gift: boolean;
};

export type TwitchSubscriptionMessageEvent = {
  user_id: string;
  user_login: string;
  user_name: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  tier: string;
  message: {
    text: string;
    emotes: Array<{
      begin: number;
      end: number;
      id: string;
    }>;
  };
  cumulative_months: number;
  streak_months: number | null;
  duration_months: number;
};

export type TwitchSubscriptionGiftEvent = {
  user_id: string | null;
  user_login: string | null;
  user_name: string | null;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  total: number;
  tier: string;
  cumulative_total: number | null;
  is_anonymous: boolean;
};

export type TwitchCheerEvent = {
  is_anonymous: boolean;
  user_id: string | null;
  user_login: string | null;
  user_name: string | null;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  message: string;
  bits: number;
};

export type TwitchRaidEvent = {
  from_broadcaster_user_id: string;
  from_broadcaster_user_login: string;
  from_broadcaster_user_name: string;
  to_broadcaster_user_id: string;
  to_broadcaster_user_login: string;
  to_broadcaster_user_name: string;
  viewers: number;
};