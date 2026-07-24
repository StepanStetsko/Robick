export type PollOption = { label: string; votes: number };

export type PollState = {
  active: boolean;
  status: "idle" | "running" | "ended";
  title: string;
  options: PollOption[];
  totalVotes: number;
  endsAt: number | null;
  durationSec: number;
  winnerIndex: number | null;
};

export type StartPollInput = {
  title: string;
  options: string[];
  durationSec: number;
};

export const MAX_POLL_OPTIONS = 8;
