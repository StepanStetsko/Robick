export type CustomCommandTargetTransport = "unreal" | "unity";

export type CustomChatCommand = {
  name: string;
  responseText: string;
  enabled: boolean;
  cooldownMs: number;
  replyMode: "reply" | "normal";
  actionEnabled?: boolean;
  targetTransports?: CustomCommandTargetTransport[];
  unrealEventName?: string | null;
  unityEventName?: string | null;
  payloadTemplate?: unknown | null;
};

export type CreateCustomChatCommandInput = {
  name: string;
  responseText: string;
  enabled?: boolean;
  cooldownMs?: number;
  replyMode?: "reply" | "normal";
  actionEnabled?: boolean;
  targetTransports?: CustomCommandTargetTransport[];
  unrealEventName?: string | null;
  unityEventName?: string | null;
  payloadTemplate?: unknown | null;
};

export type UpdateCustomChatCommandInput = {
  responseText?: string;
  enabled?: boolean;
  cooldownMs?: number;
  replyMode?: "reply" | "normal";
  actionEnabled?: boolean;
  targetTransports?: CustomCommandTargetTransport[];
  unrealEventName?: string | null;
  unityEventName?: string | null;
  payloadTemplate?: unknown | null;
};
