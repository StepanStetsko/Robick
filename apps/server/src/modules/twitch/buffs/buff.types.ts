export type BuffEffectType =
  | "chance"
  | "multiplier"
  | "flat"
  | "guarantee";
export type BuffDurationMode = "time" | "rolls";
export type BuffTarget = "self" | "other";
export type BuffKind = "buff" | "debuff";

export const BUFF_EFFECT_TYPES: BuffEffectType[] = [
  "chance",
  "multiplier",
  "flat",
  "guarantee",
];

export const BUFF_KINDS: BuffKind[] = ["buff", "debuff"];

export type BuffDefinitionDto = {
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

export type CreateBuffDefinitionInput = {
  key: string;
  title: string;
  description?: string;
  kind?: BuffKind;
  effectType?: BuffEffectType;
  magnitude?: number;
  durationMode?: BuffDurationMode;
  durationValue?: number;
  cost?: number;
  target?: BuffTarget;
  enabled?: boolean;
};

export type UpdateBuffDefinitionInput = Partial<CreateBuffDefinitionInput>;

export type ActiveBuffDto = {
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

export type BuffViewerInput = {
  twitchUserId: string;
  userLogin: string;
  displayName?: string | null;
};
