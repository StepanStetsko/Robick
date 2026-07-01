export type ReplyMode = "reply" | "normal";

export type CustomCommandTargetTransport = "unreal" | "unity";

export type CustomCommand = {
  name: string;
  responseText: string;
  enabled: boolean;
  cooldownMs: number;
  replyMode: ReplyMode;
  actionEnabled?: boolean;
  targetTransports?: CustomCommandTargetTransport[];
  unrealEventName?: string | null;
  unityEventName?: string | null;
  payloadTemplate?: unknown | null;
};

export type CustomCommandUsageStatus =
  | "executed"
  | "failed"
  | "cooldown"
  | "disabled_or_missing";

export type CustomCommandActionDispatchStatus = "skipped" | "dispatched" | "failed";

export type CustomCommandUsageHistoryEntry = {
  id: string;
  timestamp: string;
  commandName: string;
  userId: string;
  userLogin: string;
  userName: string;
  responseText: string;
  replyMode: ReplyMode;
  status: CustomCommandUsageStatus;
  messageId: string;
  actionEnabled?: boolean;
  targetTransports?: string[];
  unityEventName?: string | null;
  unrealEventName?: string | null;
  actionDispatchStatus?: CustomCommandActionDispatchStatus;
};

export type CreateCustomCommandDto = {
  name: string;
  responseText: string;
  enabled: boolean;
  cooldownMs: number;
  replyMode: ReplyMode;
  actionEnabled?: boolean;
  targetTransports?: CustomCommandTargetTransport[];
  unrealEventName?: string | null;
  unityEventName?: string | null;
  payloadTemplate?: unknown | null;
};

export type UpdateCustomCommandDto = Partial<Omit<CreateCustomCommandDto, "name">>;
