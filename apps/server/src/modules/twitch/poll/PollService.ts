// Chat poll / voting. One poll at a time, held in memory (transient — a server
// restart clears it). Viewers vote by typing the option number (1..N) or the
// exact option text; one vote per person. The overlay + admin read the state
// over HTTP (polling), so no realtime wiring is needed.

export const MAX_POLL_OPTIONS = 8;

export type PollOptionDto = {
  label: string;
  votes: number;
};

export type PollStatus = "idle" | "running" | "ended";

export type PollStateDto = {
  active: boolean;
  status: PollStatus;
  title: string;
  options: PollOptionDto[];
  totalVotes: number;
  /** Epoch ms when the poll ends (running) or ended. Null when idle. */
  endsAt: number | null;
  durationSec: number;
  /** Index of the winning option once ended (null while running / on a tie-less empty poll). */
  winnerIndex: number | null;
};

export type StartPollInput = {
  title: string;
  options: string[];
  durationSec: number;
};

export class PollService {
  private status: PollStatus = "idle";
  private title = "";
  private options: string[] = [];
  private counts: number[] = [];
  private readonly voters = new Map<string, number>();
  private endsAt: number | null = null;
  private durationSec = 0;
  private winnerIndex: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(input: StartPollInput): PollStateDto {
    const title = input.title.trim();
    const options = input.options
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, MAX_POLL_OPTIONS);

    if (options.length < 2) {
      throw new Error("Потрібно щонайменше 2 варіанти");
    }
    // Case-insensitive duplicate options would make word-voting ambiguous.
    const seen = new Set<string>();
    for (const o of options) {
      const key = o.toLocaleLowerCase();
      if (seen.has(key)) {
        throw new Error(`Варіанти повторюються: «${o}»`);
      }
      seen.add(key);
    }

    const durationSec = Math.max(5, Math.min(3600, Math.round(input.durationSec)));

    this.clearTimer();
    this.status = "running";
    this.title = title;
    this.options = options;
    this.counts = options.map(() => 0);
    this.voters.clear();
    this.durationSec = durationSec;
    this.endsAt = Date.now() + durationSec * 1000;
    this.winnerIndex = null;

    this.timer = setTimeout(() => this.finish(), durationSec * 1000);
    return this.getState();
  }

  /** End the poll now (compute the winner). */
  stop(): PollStateDto {
    if (this.status === "running") {
      this.finish();
    }
    return this.getState();
  }

  /** Remove the poll from the overlay (triggers the disappear animation). */
  clear(): PollStateDto {
    this.clearTimer();
    this.status = "idle";
    this.title = "";
    this.options = [];
    this.counts = [];
    this.voters.clear();
    this.endsAt = null;
    this.durationSec = 0;
    this.winnerIndex = null;
    return this.getState();
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  /**
   * Try to record a vote from a chat message. Returns true if it counted (so the
   * caller can consume the message). A leading "!" (command) never votes.
   */
  tryVote(voterId: string, rawText: string): boolean {
    if (this.status !== "running") {
      return false;
    }
    const text = rawText.trim();
    if (!text || text.startsWith("!")) {
      return false;
    }

    let index = -1;
    if (/^\d+$/.test(text)) {
      const n = Number.parseInt(text, 10);
      if (n >= 1 && n <= this.options.length) {
        index = n - 1;
      }
    }
    if (index === -1) {
      const lower = text.toLocaleLowerCase();
      index = this.options.findIndex((o) => o.toLocaleLowerCase() === lower);
    }
    if (index === -1) {
      return false;
    }

    // One vote per person — the first valid vote sticks.
    if (this.voters.has(voterId)) {
      return true;
    }
    this.voters.set(voterId, index);
    this.counts[index] += 1;
    return true;
  }

  getState(): PollStateDto {
    return {
      active: this.status !== "idle",
      status: this.status,
      title: this.title,
      options: this.options.map((label, i) => ({
        label,
        votes: this.counts[i] ?? 0,
      })),
      totalVotes: this.counts.reduce((a, b) => a + b, 0),
      endsAt: this.endsAt,
      durationSec: this.durationSec,
      winnerIndex: this.winnerIndex,
    };
  }

  private finish(): void {
    if (this.status !== "running") {
      return;
    }
    this.clearTimer();
    this.status = "ended";
    this.endsAt = Date.now();
    this.winnerIndex = this.computeWinner();
  }

  private computeWinner(): number | null {
    let best = -1;
    let bestIndex: number | null = null;
    this.counts.forEach((count, i) => {
      if (count > best) {
        best = count;
        bestIndex = i;
      }
    });
    // No votes at all → no winner highlight.
    return best > 0 ? bestIndex : null;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
