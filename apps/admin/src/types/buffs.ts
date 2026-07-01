export type BuffEffectType =
  | "chance"
  | "multiplier"
  | "flat"
  | "guarantee"
  | "no_earn";
export type BuffDurationMode = "time" | "rolls";
export type BuffTarget = "self" | "other";
export type BuffKind = "buff" | "debuff";

export type BuffDefinition = {
  id: string;
  key: string;
  title: string;
  description: string;
  kind: BuffKind;
  effectType: BuffEffectType;
  magnitude: number;
  durationMode: BuffDurationMode;
  durationValue: number;
  cost: number;
  target: BuffTarget;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActiveBuff = {
  id: string;
  twitchUserId: string;
  userLogin: string;
  buffKey: string;
  title: string;
  kind: BuffKind;
  effectType: BuffEffectType;
  magnitude: number;
  durationMode: BuffDurationMode;
  expiresAt: string | null;
  rollsRemaining: number | null;
  source: string;
  createdAt: string;
};

export type SaveBuffDefinitionDto = {
  key: string;
  title: string;
  description: string;
  kind: BuffKind;
  effectType: BuffEffectType;
  magnitude: number;
  durationMode: BuffDurationMode;
  durationValue: number;
  cost: number;
  target: BuffTarget;
  enabled: boolean;
};
