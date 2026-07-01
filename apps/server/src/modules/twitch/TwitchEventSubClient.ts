import WebSocket, { type RawData } from "ws";
import { logger } from "../../core/logger/logger.js";
import { TwitchEventRouter } from "./TwitchEventRouter.js";
import type { EventSubWebSocketMessage } from "./twitch.types.js";
import { EventDeduplicationService } from "./guards/EventDeduplicationService.js";

type SessionWelcomeHandler = (sessionId: string) => Promise<void>;
type NotificationMessage = Parameters<TwitchEventRouter["handleNotification"]>[0];

type SessionPayload = {
  session: {
    id: string;
    reconnect_url: string | null;
    keepalive_timeout_seconds?: number;
  };
};

type SubscriptionPayload = {
  subscription: Record<string, unknown>;
};

type TwitchEventSubClientOptions = {
  clientName: string;
  shouldReconnect: () => boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onKeepalive?: () => void;
};

function hasSessionPayload(
  message: EventSubWebSocketMessage,
): message is EventSubWebSocketMessage & { payload: SessionPayload } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof message.payload === "object" &&
    message.payload !== null &&
    "session" in message.payload
  );
}

function hasSubscriptionPayload(
  message: EventSubWebSocketMessage,
): message is EventSubWebSocketMessage & { payload: SubscriptionPayload } {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof message.payload === "object" &&
    message.payload !== null &&
    "subscription" in message.payload
  );
}

export class TwitchEventSubClient {
  private socket: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectUrl: string | null = null;
  private readonly deduplicationService = new EventDeduplicationService();

  private manualDisconnect = false;
  private currentUrl = "wss://eventsub.wss.twitch.tv/ws";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimeoutMs = 30_000;
  private reconnectDelayMs = 3_000;

  constructor(
    private readonly eventRouter: TwitchEventRouter,
    private readonly onSessionWelcome: SessionWelcomeHandler,
    private readonly options: TwitchEventSubClientOptions,
  ) {}

  async connect(url = this.currentUrl) {
    this.manualDisconnect = false;
    this.currentUrl = url;

    this.clearReconnectTimer();
    this.clearKeepaliveWatchdog();

    await this.destroySocket();

    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      logger.info("Connected to Twitch EventSub WebSocket", {
        client: this.options.clientName,
        url,
      });
    });

    this.socket.on("message", async (data: RawData) => {
      try {
        const raw = data.toString();
        const message = JSON.parse(raw) as EventSubWebSocketMessage;

        await this.handleMessage(message);
      } catch (error: unknown) {
        logger.error("Failed to handle EventSub message", {
          client: this.options.clientName,
          error,
        });
      }
    });

    this.socket.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();

      logger.warn("Twitch EventSub WebSocket closed", {
        client: this.options.clientName,
        code,
        reason,
        manualDisconnect: this.manualDisconnect,
      });

      this.handleSocketClosed();
    });

    this.socket.on("error", (error: Error) => {
      logger.error("Twitch EventSub WebSocket error", {
        client: this.options.clientName,
        error,
      });
    });
  }

  async disconnect() {
    this.manualDisconnect = true;

    this.clearReconnectTimer();
    this.clearKeepaliveWatchdog();

    await this.destroySocket();

    this.sessionId = null;
    this.reconnectUrl = null;

    this.options.onDisconnected?.();
  }

  getSessionId() {
    return this.sessionId;
  }

  private async handleMessage(message: EventSubWebSocketMessage) {
    switch (message.metadata.message_type) {
      case "session_welcome": {
        if (!hasSessionPayload(message)) {
          logger.warn("Invalid EventSub session_welcome payload", {
            client: this.options.clientName,
            message,
          });
          return;
        }

        const sessionId = message.payload.session.id;
        const reconnectUrl = message.payload.session.reconnect_url ?? null;
        const keepaliveTimeoutSeconds =
          message.payload.session.keepalive_timeout_seconds ?? 30;

        this.sessionId = sessionId;
        this.reconnectUrl = reconnectUrl;
        this.keepaliveTimeoutMs = Math.max(keepaliveTimeoutSeconds * 1000, 10_000);

        logger.info("EventSub session welcome", {
          client: this.options.clientName,
          sessionId,
          reconnectUrl,
          keepaliveTimeoutSeconds,
        });

        this.resetKeepaliveWatchdog();

        await this.onSessionWelcome(sessionId);

        this.options.onConnected?.();
        return;
      }

      case "session_keepalive": {
        logger.info("EventSub keepalive received", {
          client: this.options.clientName,
        });

        this.resetKeepaliveWatchdog();
        this.options.onKeepalive?.();
        return;
      }

      case "session_reconnect": {
        if (!hasSessionPayload(message)) {
          logger.warn("Invalid EventSub session_reconnect payload", {
            client: this.options.clientName,
            message,
          });
          return;
        }

        const reconnectUrl = message.payload.session.reconnect_url ?? null;

        logger.warn("EventSub requested reconnect", {
          client: this.options.clientName,
          reconnectUrl,
        });

        if (reconnectUrl) {
          this.currentUrl = reconnectUrl;
          await this.reconnectNow(reconnectUrl);
        }

        return;
      }

      case "notification": {
        const notificationMessage = message as NotificationMessage;
        const messageId = notificationMessage.metadata.message_id;

        if (this.deduplicationService.isDuplicate(messageId)) {
          logger.warn("Skipping duplicate EventSub notification", {
            client: this.options.clientName,
            messageId,
            subscriptionType: notificationMessage.payload.subscription.type,
          });
          return;
        }

        this.resetKeepaliveWatchdog();

        logger.info("EventSub notification message received", {
          client: this.options.clientName,
          messageId,
          subscriptionType: notificationMessage.payload.subscription.type,
        });

        await this.eventRouter.handleNotification(notificationMessage);
        return;
      }

      case "revocation": {
        if (!hasSubscriptionPayload(message)) {
          logger.warn("Invalid EventSub revocation payload", {
            client: this.options.clientName,
            message,
          });
          return;
        }

        logger.warn("EventSub subscription revoked", {
          client: this.options.clientName,
          subscription: message.payload.subscription,
        });

        return;
      }

      default:
        logger.warn("Unknown EventSub message type", {
          client: this.options.clientName,
          messageType: message.metadata.message_type,
        });
    }
  }

  private handleSocketClosed() {
    this.clearKeepaliveWatchdog();

    this.socket = null;
    this.sessionId = null;
    this.reconnectUrl = null;

    this.options.onDisconnected?.();

    if (!this.manualDisconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.options.shouldReconnect()) {
      logger.info("Skipping EventSub reconnect because runtime is stopped", {
        client: this.options.clientName,
      });
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const reconnectTarget = this.reconnectUrl ?? this.currentUrl;

    logger.warn("Scheduling EventSub reconnect", {
      client: this.options.clientName,
      reconnectTarget,
      delayMs: this.reconnectDelayMs,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      void this.connect(reconnectTarget).catch((error: unknown) => {
        logger.error("EventSub reconnect attempt failed", {
          client: this.options.clientName,
          reconnectTarget,
          error,
        });

        this.scheduleReconnect();
      });
    }, this.reconnectDelayMs);
  }

  private async reconnectNow(url: string) {
    this.clearReconnectTimer();
    this.clearKeepaliveWatchdog();

    logger.warn("Reconnecting EventSub immediately", {
      client: this.options.clientName,
      url,
    });

    try {
      await this.connect(url);
    } catch (error: unknown) {
      logger.error("Immediate EventSub reconnect failed", {
        client: this.options.clientName,
        url,
        error,
      });

      this.scheduleReconnect();
    }
  }

  private resetKeepaliveWatchdog() {
    this.clearKeepaliveWatchdog();

    const watchdogMs = this.keepaliveTimeoutMs * 2;

    this.keepaliveWatchdogTimer = setTimeout(() => {
      logger.warn("EventSub keepalive watchdog expired", {
        client: this.options.clientName,
        keepaliveTimeoutMs: this.keepaliveTimeoutMs,
      });

      this.options.onDisconnected?.();

      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.terminate();
        this.socket = null;
      }

      this.sessionId = null;
      this.reconnectUrl = null;

      this.scheduleReconnect();
    }, watchdogMs);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearKeepaliveWatchdog() {
    if (!this.keepaliveWatchdogTimer) {
      return;
    }

    clearTimeout(this.keepaliveWatchdogTimer);
    this.keepaliveWatchdogTimer = null;
  }

  private async destroySocket() {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;

    socket.removeAllListeners();

    try {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    } catch {
      // no-op
    }
  }
}