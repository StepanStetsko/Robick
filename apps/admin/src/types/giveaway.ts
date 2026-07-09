export type GiveawayWinnersMode = "fixed" | "dynamic";

export type GiveawayPreset = {
  commandName: string;
  winnersMode: GiveawayWinnersMode;
  fixedWinners: number;
  minWinners: number;
  maxWinners: number;
  participantsForMax: number;
  enabled: boolean;
};

export type GiveawayMessages = {
  start: string;
  reminder: string;
  winners: string;
  noParticipants: string;
  alreadyRunning: string;
  notAllowed: string;
  invalidAmount: string;
  selfStart: string;
  selfInsufficient: string;
  selfBelowMin: string;
  selfRefunded: string;
};

export type GiveawaySettings = {
  joinKeyword: string;
  selfCommand: string;
  maxAmount: number;
  selfMinAmount: number;
  durationSeconds: number;
  reminderMinSeconds: number;
  reminderMaxSeconds: number;
  presets: GiveawayPreset[];
  messages: GiveawayMessages;
  updatedAt: string;
};

export type SaveGiveawaySettingsDto = Partial<
  Omit<GiveawaySettings, "updatedAt">
>;
