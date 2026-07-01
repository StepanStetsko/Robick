export type PresenceLogEntry = {
  twitchUserId: string;
  userLogin: string;
  displayName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  presentNow: boolean;
  hasChatted: boolean;
  messageCount: number;
  lastChatAt: number | null;
};

export type PresenceLog = {
  entries: PresenceLogEntry[];
  updatedAt: number;
};
