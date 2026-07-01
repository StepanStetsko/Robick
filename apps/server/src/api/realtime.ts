import type { TwitchRealtimeEventMap } from "../types/realtime";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

type RealtimeHandlers = {
  onOpen?: () => void;
  onError?: () => void;
  onSnapshot?: (data: TwitchRealtimeEventMap["snapshot"]) => void;
  onRuntimeStatus?: (data: TwitchRealtimeEventMap["runtime.status"]) => void;
  onEventAppended?: (data: TwitchRealtimeEventMap["event.appended"]) => void;
  onEventCleared?: (data: TwitchRealtimeEventMap["event.cleared"]) => void;
  onQueueStatus?: (data: TwitchRealtimeEventMap["queue.status"]) => void;
  onAuthStatus?: (data: TwitchRealtimeEventMap["auth.status"]) => void;
  onCommandsChanged?: (data: TwitchRealtimeEventMap["commands.changed"]) => void;
  onCommandUsageAppended?: (
    data: TwitchRealtimeEventMap["command.usage.appended"],
  ) => void;
  onRewardQueueUpdated?: (
    data: TwitchRealtimeEventMap["reward.queue.updated"],
  ) => void;
  onRewardHistoryAppended?: (
    data: TwitchRealtimeEventMap["reward.history.appended"],
  ) => void;
  onRewardHistoryUpdated?: (
    data: TwitchRealtimeEventMap["reward.history.updated"],
  ) => void;
};

function parseEventData<T>(event: MessageEvent<string>): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

export function subscribeToTwitchRealtime(handlers: RealtimeHandlers) {
  const url = new URL("/api/twitch/realtime/stream", API_BASE_URL);
  const source = new EventSource(url.toString());

  source.onopen = () => {
    handlers.onOpen?.();
  };

  source.onerror = () => {
    handlers.onError?.();
  };

  source.addEventListener("snapshot", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["snapshot"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onSnapshot?.(parsed);
    }
  });

  source.addEventListener("runtime.status", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["runtime.status"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onRuntimeStatus?.(parsed);
    }
  });

  source.addEventListener("event.appended", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["event.appended"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onEventAppended?.(parsed);
    }
  });

  source.addEventListener("event.cleared", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["event.cleared"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onEventCleared?.(parsed);
    }
  });

  source.addEventListener("queue.status", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["queue.status"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onQueueStatus?.(parsed);
    }
  });

  source.addEventListener("auth.status", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["auth.status"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onAuthStatus?.(parsed);
    }
  });

  source.addEventListener("commands.changed", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["commands.changed"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onCommandsChanged?.(parsed);
    }
  });

  source.addEventListener("command.usage.appended", (event) => {
    const parsed = parseEventData<
      TwitchRealtimeEventMap["command.usage.appended"]
    >(event as MessageEvent<string>);

    if (parsed) {
      handlers.onCommandUsageAppended?.(parsed);
    }
  });

  source.addEventListener("reward.queue.updated", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["reward.queue.updated"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onRewardQueueUpdated?.(parsed);
    }
  });

  source.addEventListener("reward.history.appended", (event) => {
    const parsed = parseEventData<
      TwitchRealtimeEventMap["reward.history.appended"]
    >(event as MessageEvent<string>);

    if (parsed) {
      handlers.onRewardHistoryAppended?.(parsed);
    }
  });

  source.addEventListener("reward.history.updated", (event) => {
    const parsed = parseEventData<TwitchRealtimeEventMap["reward.history.updated"]>(
      event as MessageEvent<string>,
    );

    if (parsed) {
      handlers.onRewardHistoryUpdated?.(parsed);
    }
  });

  return () => {
    source.close();
  };
}