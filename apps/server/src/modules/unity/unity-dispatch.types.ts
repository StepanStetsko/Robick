export type UnityRewardDispatchMessage = {
  type: "reward_dispatch";
  transport: "unity";
  eventId: string;
  redemptionId: string;
  broadcasterId: string;
  broadcasterLogin: string;
  broadcasterDisplayName: string;
  userInput: string;
  eventName: string;
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
    unityEventName: string;
    unrealEventName: string;
    targetTransports: string[];
  };
  payload: Record<string, unknown>;
};

export type UnityChatCommandDispatchMessage = {
  type: "chat_command_dispatch";
  transport: "unity";
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

export type UnityAdminActionDispatchMessage = {
  type: "admin_action_dispatch";
  transport: "unity";
  eventId: string;
  eventName: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

export type UnityHelloMessage = {
  type: "hello";
  transport: "unity";
  message: string;
  timestamp: string;
};

export type UnityOutboundMessage =
  | UnityRewardDispatchMessage
  | UnityChatCommandDispatchMessage
  | UnityAdminActionDispatchMessage
  | UnityHelloMessage;


export type UnityCapabilityFieldKind = "text" | "number" | "boolean" | "target" | "select";

export type UnityCapabilityFieldOption = {
  id: string;
  label: string;
  path?: string;
};

export type UnityCapabilityField = {
  name: string;
  label: string;
  kind: UnityCapabilityFieldKind;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  options?: UnityCapabilityFieldOption[];
};

export type UnityCapabilityTarget = {
  id: string;
  name: string;
  path?: string;
};

export type UnityCapabilityAction = {
  eventName: string;
  label: string;
  description?: string;
  targets?: UnityCapabilityTarget[];
  fields: UnityCapabilityField[];
};

export type UnityCapabilitiesMessage = {
  type: "capabilities";
  transport: "unity";
  timestamp: string;
  actions: UnityCapabilityAction[];
};

