type TwitchRealtimeEventName =
  | "snapshot"
  | "runtime.status"
  | "event.appended"
  | "event.cleared"
  | "queue.status"
  | "auth.status"
  | "engine.status"
  | "engine.capabilities"
  | "commands.changed"
  | "command.usage.appended"
  | "fun-meter.roll"
  | "fun-meter.leaderboard.changed"
  | "fun-meter.features.changed"
  | "reward.queue.updated"
  | "reward.history.appended"
  | "reward.history.updated"
  | "song-queue.changed"
  | "ping";

export type TwitchRealtimeMessage = {
  event: TwitchRealtimeEventName;
  data: unknown;
};

type TwitchRealtimeListener = (message: TwitchRealtimeMessage) => void;

class TwitchRealtimeHub {
  private readonly listeners = new Set<TwitchRealtimeListener>();

  subscribe(listener: TwitchRealtimeListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: TwitchRealtimeEventName, data: unknown) {
    const message: TwitchRealtimeMessage = { event, data };

    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        console.error("[twitch-realtime-hub] listener failed", error);
      }
    }
  }
}

export const twitchRealtimeHub = new TwitchRealtimeHub();


