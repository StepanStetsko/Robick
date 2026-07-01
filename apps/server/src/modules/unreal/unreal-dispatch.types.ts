export type UnrealRewardDispatchMessage = {
  type: "reward_dispatch";
  eventId: string;
  redemptionId: string;
  broadcasterId: string;
  broadcasterLogin: string;
  broadcasterDisplayName: string;
  userInput: string;
  user: {
    id: string;
    login: string;
    displayName: string;
  };
  reward: {
    rewardId: string;
    rewardTitle: string;
    rewardPrompt: string;
    cost: number;
  };
  mapping: {
    mappingId: string;
    unrealEventName: string;
  };
  payload: Record<string, unknown>;
};

export type UnrealChatCommandDispatchMessage = {
  type: "chat_command_dispatch";
  eventId: string;
  messageId: string;
  commandName: string;
  eventName: string;
  args: string[];
  rawText: string;
  user: {
    id: string;
    login: string;
    displayName: string;
  };
  payload: Record<string, unknown>;
  timestamp: string;
};

export type UnrealHelloMessage = {
  type: "hello";
  message: string;
  timestamp: string;
};

export type UnrealOutboundMessage =
  | UnrealRewardDispatchMessage
  | UnrealChatCommandDispatchMessage
  | UnrealHelloMessage;
