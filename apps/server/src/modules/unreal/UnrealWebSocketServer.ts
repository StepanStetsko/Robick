import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../../core/logger/logger.js";
import type {
  UnrealChatCommandDispatchMessage,
  UnrealOutboundMessage,
  UnrealRewardDispatchMessage,
} from "./unreal-dispatch.types.js";

type UnrealWebSocketServerOptions = {
  port: number;
  host?: string;
  onStatusChanged?: () => void;
};

export class UnrealWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly options: UnrealWebSocketServerOptions) {}

  start() {
    if (this.wss) {
      logger.info("Unreal WebSocket server already started", {
        port: this.options.port,
        host: this.options.host ?? "0.0.0.0",
      });
      return;
    }

    this.wss = new WebSocketServer({
      port: this.options.port,
      host: this.options.host ?? "0.0.0.0",
    });

    this.wss.on("listening", () => {
      logger.info("Unreal WebSocket server started", {
        port: this.options.port,
        host: this.options.host ?? "0.0.0.0",
      });
      this.notifyStatusChanged();
    });

    this.wss.on("connection", (socket, request) => {
      this.clients.add(socket);

      logger.info("UE client connected to Unreal WebSocket transport", {
        remoteAddress: request.socket.remoteAddress,
        clientsCount: this.clients.size,
      });
      this.notifyStatusChanged();

      socket.on("message", (raw) => {
        logger.info("Message received from UE client", {
          message: raw.toString(),
        });
      });

      socket.on("close", () => {
        this.clients.delete(socket);

        logger.info("UE client disconnected from Unreal WebSocket transport", {
          clientsCount: this.clients.size,
        });
        this.notifyStatusChanged();
      });

      socket.on("error", (error) => {
        logger.error("UE client socket error", {
          error,
        });
        this.notifyStatusChanged();
      });

      this.sendToClient(socket, {
        type: "hello",
        message: "Connected to Node Unreal transport",
        timestamp: new Date().toISOString(),
      });
    });

    this.wss.on("error", (error) => {
      logger.error("Unreal WebSocket server error", {
        error,
      });
      this.notifyStatusChanged();
    });
  }

  stop() {
    if (!this.wss) {
      return;
    }

    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // ignore close errors
      }
    }

    this.clients.clear();

    this.wss.close();
    this.wss = null;

    logger.info("Unreal WebSocket server stopped");
    this.notifyStatusChanged();
  }

  broadcastRewardDispatch(message: UnrealRewardDispatchMessage) {
    const deliveredCount = this.broadcast(message);

    logger.info("Reward dispatch broadcasted to UE clients", {
      deliveredCount,
      eventId: message.eventId,
      redemptionId: message.redemptionId,
      unrealEventName: message.mapping.unrealEventName,
    });

    return deliveredCount;
  }

  broadcastChatCommandDispatch(message: UnrealChatCommandDispatchMessage) {
    const deliveredCount = this.broadcast(message);

    logger.info("Chat command dispatch broadcasted to UE clients", {
      deliveredCount,
      eventId: message.eventId,
      messageId: message.messageId,
      commandName: message.commandName,
      unrealEventName: message.eventName,
    });

    return deliveredCount;
  }

  getStatus() {
    return {
      started: Boolean(this.wss),
      clientsCount: this.clients.size,
      port: this.options.port,
      host: this.options.host ?? "0.0.0.0",
    };
  }

  private broadcast(message: UnrealOutboundMessage) {
    const serialized = JSON.stringify(message);
    let deliveredCount = 0;

    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }

      client.send(serialized);
      deliveredCount += 1;
    }

    return deliveredCount;
  }

  private sendToClient(client: WebSocket, message: UnrealOutboundMessage) {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify(message));
  }

  private notifyStatusChanged() {
    this.options.onStatusChanged?.();
  }
}
