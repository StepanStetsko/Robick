import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../../core/logger/logger.js";
import type {
  UnityAdminActionDispatchMessage,
  UnityCapabilitiesMessage,
  UnityCapabilityAction,
  UnityCapabilityField,
  UnityCapabilityFieldOption,
  UnityCapabilityTarget,
  UnityChatCommandDispatchMessage,
  UnityOutboundMessage,
  UnityRewardDispatchMessage,
} from "./unity-dispatch.types.js";

type UnityWebSocketServerOptions = {
  port: number;
  host?: string;
  onStatusChanged?: () => void;
  onCapabilitiesChanged?: (capabilities: UnityCapabilitiesMessage | null) => void;
};

export class UnityWebSocketServer {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<WebSocket>();
  private capabilities: UnityCapabilitiesMessage | null = null;

  constructor(private readonly options: UnityWebSocketServerOptions) {}

  start() {
    if (this.wss) {
      logger.info("Unity WebSocket server already started", {
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
      logger.info("Unity WebSocket server started", {
        port: this.options.port,
        host: this.options.host ?? "0.0.0.0",
      });
      this.notifyStatusChanged();
    });

    this.wss.on("connection", (socket, request) => {
      this.clients.add(socket);

      logger.info("Unity client connected to Unity WebSocket transport", {
        remoteAddress: request.socket.remoteAddress,
        clientsCount: this.clients.size,
      });
      this.notifyStatusChanged();

      socket.on("message", (raw) => {
        this.handleClientMessage(raw.toString());
      });

      socket.on("close", () => {
        this.clients.delete(socket);

        if (this.clients.size === 0) {
          this.setCapabilities(null);
        }

        logger.info("Unity client disconnected from Unity WebSocket transport", {
          clientsCount: this.clients.size,
        });
        this.notifyStatusChanged();
      });

      socket.on("error", (error) => {
        logger.error("Unity client socket error", {
          error,
        });
        this.notifyStatusChanged();
      });

      this.sendToClient(socket, {
        type: "hello",
        transport: "unity",
        message: "Connected to Node Unity transport",
        timestamp: new Date().toISOString(),
      });
    });

    this.wss.on("error", (error) => {
      logger.error("Unity WebSocket server error", {
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
    this.setCapabilities(null);

    this.wss.close();
    this.wss = null;

    logger.info("Unity WebSocket server stopped");
    this.notifyStatusChanged();
  }

  broadcastRewardDispatch(message: UnityRewardDispatchMessage) {
    const deliveredCount = this.broadcast(message);

    logger.info("Reward dispatch broadcasted to Unity clients", {
      deliveredCount,
      eventId: message.eventId,
      redemptionId: message.redemptionId,
      unityEventName: message.mapping.unityEventName,
    });

    return deliveredCount;
  }

  broadcastAdminActionDispatch(message: UnityAdminActionDispatchMessage) {
    const deliveredCount = this.broadcast(message);

    logger.info("Admin action dispatch broadcasted to Unity clients", {
      deliveredCount,
      eventId: message.eventId,
      unityEventName: message.eventName,
    });

    return deliveredCount;
  }

  broadcastChatCommandDispatch(message: UnityChatCommandDispatchMessage) {
    const deliveredCount = this.broadcast(message);

    logger.info("Chat command dispatch broadcasted to Unity clients", {
      deliveredCount,
      eventId: message.eventId,
      messageId: message.messageId,
      commandName: message.commandName,
      unityEventName: message.eventName,
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

  getCapabilities() {
    return this.capabilities;
  }

  private broadcast(message: UnityOutboundMessage) {
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

  private sendToClient(client: WebSocket, message: UnityOutboundMessage) {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(JSON.stringify(message));
  }

  private handleClientMessage(raw: string) {
    const parsed = this.parseJsonObject(raw);

    if (!parsed) {
      logger.info("Message received from Unity client", {
        message: raw,
      });
      return;
    }

    if (parsed.type === "capabilities") {
      const capabilities = this.normalizeCapabilities(parsed);

      if (!capabilities) {
        logger.warn("Invalid Unity capabilities message ignored", {
          message: raw,
        });
        return;
      }

      this.setCapabilities(capabilities);
      logger.info("Unity capabilities updated", {
        actionsCount: capabilities.actions.length,
        targetCount: capabilities.actions.reduce(
          (total, action) => total + (action.targets?.length ?? 0),
          0,
        ),
      });
      return;
    }

    logger.info("Message received from Unity client", {
      type: parsed.type,
    });
  }

  private parseJsonObject(raw: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(raw);

      if (!this.isRecord(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private normalizeCapabilities(
    input: Record<string, unknown>,
  ): UnityCapabilitiesMessage | null {
    if (input.type !== "capabilities") {
      return null;
    }

    const rawActions = Array.isArray(input.actions) ? input.actions : [];
    const actions = rawActions
      .map((item) => (this.isRecord(item) ? this.normalizeAction(item) : null))
      .filter((item): item is UnityCapabilityAction => item !== null);

    return {
      type: "capabilities",
      transport: "unity",
      timestamp:
        typeof input.timestamp === "string" && input.timestamp
          ? input.timestamp
          : new Date().toISOString(),
      actions,
    };
  }

  private normalizeAction(input: Record<string, unknown>): UnityCapabilityAction | null {
    if (typeof input.eventName !== "string" || !input.eventName.trim()) {
      return null;
    }

    const rawFields = Array.isArray(input.fields) ? input.fields : [];
    const rawTargets = Array.isArray(input.targets) ? input.targets : [];

    return {
      eventName: input.eventName.trim(),
      label:
        typeof input.label === "string" && input.label.trim()
          ? input.label.trim()
          : input.eventName.trim(),
      description:
        typeof input.description === "string" && input.description.trim()
          ? input.description.trim()
          : undefined,
      targets: rawTargets
        .map((item) => (this.isRecord(item) ? this.normalizeTarget(item) : null))
        .filter((item): item is UnityCapabilityTarget => item !== null),
      fields: rawFields
        .map((item) => (this.isRecord(item) ? this.normalizeField(item) : null))
        .filter((item): item is UnityCapabilityField => item !== null),
    };
  }

  private normalizeTarget(input: Record<string, unknown>): UnityCapabilityTarget | null {
    if (typeof input.id !== "string" || !input.id.trim()) {
      return null;
    }

    return {
      id: input.id.trim(),
      name:
        typeof input.name === "string" && input.name.trim()
          ? input.name.trim()
          : input.id.trim(),
      path:
        typeof input.path === "string" && input.path.trim()
          ? input.path.trim()
          : undefined,
    };
  }

  private normalizeField(input: Record<string, unknown>): UnityCapabilityField | null {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return null;
    }

    if (
      input.kind !== "text" &&
      input.kind !== "number" &&
      input.kind !== "boolean" &&
      input.kind !== "target" &&
      input.kind !== "select"
    ) {
      return null;
    }

    return {
      name: input.name.trim(),
      label:
        typeof input.label === "string" && input.label.trim()
          ? input.label.trim()
          : input.name.trim(),
      kind: input.kind,
      required: typeof input.required === "boolean" ? input.required : undefined,
      defaultValue: input.defaultValue,
      placeholder:
        typeof input.placeholder === "string" && input.placeholder.trim()
          ? input.placeholder.trim()
          : undefined,
      options: Array.isArray(input.options)
        ? input.options
            .map((item) => (this.isRecord(item) ? this.normalizeFieldOption(item) : null))
            .filter((item): item is UnityCapabilityFieldOption => item !== null)
        : undefined,
    };
  }

  private normalizeFieldOption(input: Record<string, unknown>): UnityCapabilityFieldOption | null {
    if (typeof input.id !== "string" || !input.id.trim()) {
      return null;
    }

    return {
      id: input.id.trim(),
      label:
        typeof input.label === "string" && input.label.trim()
          ? input.label.trim()
          : input.id.trim(),
      path:
        typeof input.path === "string" && input.path.trim()
          ? input.path.trim()
          : undefined,
    };
  }
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private setCapabilities(capabilities: UnityCapabilitiesMessage | null) {
    this.capabilities = capabilities;
    this.options.onCapabilitiesChanged?.(capabilities);
  }

  private notifyStatusChanged() {
    this.options.onStatusChanged?.();
  }
}


