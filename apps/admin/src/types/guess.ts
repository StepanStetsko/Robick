export type GuessGameMessages = {
  start: string;
  startTimed: string;
  win: string;
  timeout: string;
  stopped: string;
  alreadyRunning: string;
  notAllowed: string;
  invalidRange: string;
  rangeTooBig: string;
  noActiveGame: string;
};

export type GuessGameSettings = {
  command: string;
  stopCommand: string;
  reward: number;
  maxRange: number;
  maxDurationSeconds: number;
  messages: GuessGameMessages;
  updatedAt: string;
};

export type SaveGuessGameSettingsDto = Partial<
  Omit<GuessGameSettings, "updatedAt">
>;
