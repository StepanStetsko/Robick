import type { EconomyMessageTemplates } from "./economy.messages.js";

export const ECONOMY_SETTINGS_KEY = "economy";

export type EconomyViewerInput = {
  twitchUserId: string;
  userLogin: string;
  displayName?: string | null;
};

export type WalletDto = {
  id: string;
  twitchUserId: string;
  userLogin: string;
  displayName: string | null;
  balance: number;
  earnedTotal: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletLeaderboardEntry = WalletDto & {
  rank: number;
};

export type EconomySettingsDto = {
  unit: string;
  chatActivityPoints: number;
  chatActivityCooldownSec: number;
  presencePointsPerTick: number;
  presenceIntervalMin: number;
  lurkerReductionPercent: number;
  lurkerInactivityMin: number;
  balanceCommand: string;
  topCommand: string;
  giveCommand: string;
  buffListCommand: string;
  buffRollCommand: string;
  buffRollCost: number;
  buffRollCooldownSec: number;
  buffRollChancePercent: number;
  rouletteCommand: string;
  rouletteWinChancePercent: number;
  rouletteWinChanceMinPercent: number;
  rouletteWinChanceMaxPercent: number;
  roulettePayoutPercent: number;
  rouletteCooldownSec: number;
  rouletteLeaderLockEnabled: boolean;
  rouletteMinBet: number;
  rouletteMaxBet: number;
  stealCommand: string;
  stealChancePercent: number;
  stealMinPercent: number;
  stealMaxPercent: number;
  stealMaxAmount: number;
  stealVictimFloor: number;
  stealThiefCooldownSec: number;
  stealVictimImmunitySec: number;
  stealFinePercent: number;
  stealWarnSeconds: number;
  shieldCommand: string;
  shieldCost: number;
  shieldDurationMin: number;
  fightCommand: string;
  fightAcceptCommand: string;
  fightWinChancePercent: number;
  fightCooldownSec: number;
  fightChallengeTimeoutSec: number;
  fightMinBet: number;
  fightMaxBet: number;
  statusCommand: string;
  helpCommand: string;
  messages: EconomyMessageTemplates;
  updatedAt: string;
};

export type UpdateEconomySettingsInput = Partial<
  Omit<EconomySettingsDto, "updatedAt">
>;
