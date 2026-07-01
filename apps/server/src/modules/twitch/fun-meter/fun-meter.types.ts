export const PENIS_METER_FEATURE_KEY = "penis_meter";

export type FunMeterDirection = "increase" | "decrease";
export type FunMeterRollLimitMode = "none" | "daily";
export type FunMeterJokeBucketKey =
  | "increaseLow"
  | "increaseMedium"
  | "increaseHigh"
  | "decreaseLow"
  | "decreaseMedium"
  | "decreaseHigh"
  | "zeroBlocked";

export type FunMeterJokesDto = Record<FunMeterJokeBucketKey, string[]>;
export type FunMeterMessagesDto = {
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

export type FunMeterViewerInput = {
  twitchUserId: string;
  userLogin: string;
  displayName?: string | null;
};

export type FunMeterRollModifiers = {
  chanceDelta: number;
  multiplier: number;
  flatBonus: number;
  forcedDirection: FunMeterDirection | null;
};

export const NEUTRAL_ROLL_MODIFIERS: FunMeterRollModifiers = {
  chanceDelta: 0,
  multiplier: 1,
  flatBonus: 0,
  forcedDirection: null,
};

export type ViewerFunStatDto = {
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

export type FunMeterFeatureDto = {
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
  jokes: FunMeterJokesDto;
  messages: FunMeterMessagesDto;
  createdAt: string;
  updatedAt: string;
};

export type CreateFunMeterFeatureInput = {
  key: string;
  title: string;
  unit?: string;
  enabled?: boolean;
  aliases: string[];
  leaderboardArgs?: string[];
  selfArgs?: string[];
  rollLimitMode?: FunMeterRollLimitMode;
  increaseChance?: number;
  minRoll?: number;
  maxRoll?: number;
  jokes?: Partial<FunMeterJokesDto>;
  messages?: Partial<FunMeterMessagesDto>;
};

export type UpdateFunMeterFeatureInput = Partial<CreateFunMeterFeatureInput>;

export type FunMeterLeaderboardEntry = ViewerFunStatDto & {
  rank: number;
};

export type FunMeterNormalizedRollEvent = {
  eventKey: string;
  source: string;
  commandName: string;
  featureKey: string;
  user: {
    id: string;
    login: string;
    displayName: string | null;
  };
  result: {
    direction: FunMeterDirection;
    amount: number;
    previousScore: number;
    newScore: number;
    rank: number;
    message: string;
  };
};

export type FunMeterRollResult = {
  featureKey: string;
  feature: FunMeterFeatureDto;
  commandName: string;
  viewer: FunMeterViewerInput;
  direction: FunMeterDirection;
  amount: number;
  delta: number;
  previousScore: number;
  newScore: number;
  rank: number;
  message: string;
  chatMessage: string;
  stat: ViewerFunStatDto;
  normalizedEvent: FunMeterNormalizedRollEvent;
};

export type FunMeterSelfResult = {
  featureKey: string;
  feature: FunMeterFeatureDto;
  viewer: FunMeterViewerInput;
  score: number;
  rank: number;
  stat: ViewerFunStatDto | null;
  chatMessage: string;
};
