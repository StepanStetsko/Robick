export type BuffEffectType =
  | "chance"
  | "multiplier"
  | "flat"
  | "guarantee"
  | "no_earn";
export type BuffDurationMode = "time" | "rolls";
export type BuffTarget = "self" | "other";
export type BuffKind = "buff" | "debuff";

export const BUFF_EFFECT_TYPES: BuffEffectType[] = [
  "chance",
  "multiplier",
  "flat",
  "guarantee",
  "no_earn",
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

// ----- Buff settings (the "curse" command) -----

export const BUFF_SETTINGS_KEY = "buff";

export type BuffMessages = {
  cursed: string;
  noTarget: string;
  self: string;
  shielded: string;
  cooldown: string;
  insufficient: string;
  noDebuffs: string;
};

export type BuffSettingsDto = {
  curseCommand: string;
  curseCooldownSec: number;
  curseCost: number;
  messages: BuffMessages;
  updatedAt: string;
};

export type UpdateBuffSettingsInput = Partial<
  Omit<BuffSettingsDto, "updatedAt">
>;

export const defaultBuffMessages: BuffMessages = {
  cursed:
    "🔮 @{casterName} наклав прокляття «{title}» ({effect}) на @{victimName}!",
  noTarget: "@{casterName}, зараз нема кого проклясти.",
  self: "@{casterName}, себе проклясти не можна.",
  shielded: "@{casterName}, @{victimName} під щитом — прокляття не подіяло.",
  cooldown:
    "@{casterName}, зачекай {secondsLeft} с перед наступним прокляттям.",
  insufficient:
    "@{casterName}, на прокляття треба {cost} {unit} (у тебе {balance}).",
  noDebuffs: "@{casterName}, немає доступних дебафів для прокляття.",
};

export function normalizeBuffMessages(value: unknown): BuffMessages {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return defaultBuffMessages;
  }

  const record = value as Record<string, unknown>;
  const pick = (key: keyof BuffMessages): string => {
    const raw = record[key];
    return typeof raw === "string" && raw.trim()
      ? raw.trim()
      : defaultBuffMessages[key];
  };

  return {
    cursed: pick("cursed"),
    noTarget: pick("noTarget"),
    self: pick("self"),
    shielded: pick("shielded"),
    cooldown: pick("cooldown"),
    insufficient: pick("insufficient"),
    noDebuffs: pick("noDebuffs"),
  };
}

export function normalizeCurseCommand(value: string): string {
  const normalized = value.trim().replace(/^!+/, "").toLocaleLowerCase();
  return normalized && !/\s/.test(normalized) ? normalized : "прокляти";
}
