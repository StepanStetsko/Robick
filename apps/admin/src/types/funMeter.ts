export type FunMeterJokeBucketKey =
  | "increaseLow"
  | "increaseMedium"
  | "increaseHigh"
  | "decreaseLow"
  | "decreaseMedium"
  | "decreaseHigh"
  | "zeroBlocked";

export type FunMeterJokes = Record<FunMeterJokeBucketKey, string[]>;
export type FunMeterRollLimitMode = "daily" | "none";

export type FunMeterMessages = {
  rollMessage: string;
  zeroBlockedMessage: string;
  rollChatMessage: string;
  zeroBlockedChatMessage: string;
  dailyLimitMessage: string;
  leaderboardTitle: string;
  leaderboardEmpty: string;
  leaderboardEntry: string;
  selfScoreMessage: string;
  unknownSubcommandMessage: string;
};

export type FunMeterFeature = {
  id: string;
  key: string;
  title: string;
  unit: string;
  enabled: boolean;
  aliases: string[];
  leaderboardArgs: string[];
  selfArgs: string[];
  rollLimitMode: FunMeterRollLimitMode;
  increaseChance: number;
  minRoll: number;
  maxRoll: number;
  jokes: FunMeterJokes;
  messages: FunMeterMessages;
  createdAt: string;
  updatedAt: string;
};

export type SaveFunMeterFeatureDto = {
  key: string;
  title: string;
  unit: string;
  enabled: boolean;
  aliases: string[];
  leaderboardArgs: string[];
  selfArgs: string[];
  rollLimitMode: FunMeterRollLimitMode;
  increaseChance: number;
  minRoll: number;
  maxRoll: number;
  jokes: FunMeterJokes;
  messages: FunMeterMessages;
};

export type FunMeterViewerStatBase = {
  id: string;
  featureKey: string;
  twitchUserId: string;
  userLogin: string;
  displayName: string | null;
  score: number;
  rollsCount: number;
  lastDelta: number | null;
  lastDirection: string | null;
  lastMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FunMeterViewerStat = FunMeterViewerStatBase & {
  rank: number;
};

export type FunMeterRollResult = {
  featureKey: string;
  feature: FunMeterFeature;
  commandName: string;
  direction: "increase" | "decrease";
  amount: number;
  delta: number;
  previousScore: number;
  newScore: number;
  rank: number;
  message: string;
  chatMessage: string;
  stat: FunMeterViewerStatBase;
};
