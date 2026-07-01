import type {
  CreateCustomChatCommandInput,
  CustomChatCommand,
  CustomCommandTargetTransport,
  UpdateCustomChatCommandInput,
} from "./custom-chat-command.types.js";
import { CustomChatCommandRepository } from "./CustomChatCommandRepository.js";

const COMMAND_NAME_REGEX = /^[\p{L}\p{N}_]{2,32}$/u;
const MAX_RESPONSE_LENGTH = 500;
const MAX_COOLDOWN_MS = 600_000;
const MAX_EVENT_NAME_LENGTH = 100;

export class CustomChatCommandService {
  constructor(
    private readonly repository: CustomChatCommandRepository,
  ) {}

  getAll(): CustomChatCommand[] {
    return this.repository.findAll();
  }

  getByName(name: string): CustomChatCommand | null {
    return this.repository.findByName(this.normalizeName(name));
  }

  create(input: CreateCustomChatCommandInput): CustomChatCommand {
    const command: CustomChatCommand = {
      name: this.normalizeName(input.name),
      responseText: this.validateResponseText(input.responseText),
      enabled: this.validateBoolean(input.enabled ?? true, "enabled"),
      cooldownMs: this.validateCooldownMs(input.cooldownMs ?? 5000),
      replyMode: this.validateReplyMode(input.replyMode ?? "reply"),
      actionEnabled: this.validateBoolean(input.actionEnabled ?? false, "actionEnabled"),
      targetTransports: this.validateTargetTransports(input.targetTransports ?? []),
      unrealEventName: this.validateOptionalEventName(input.unrealEventName ?? null, "unrealEventName"),
      unityEventName: this.validateOptionalEventName(input.unityEventName ?? null, "unityEventName"),
      payloadTemplate: this.validatePayloadTemplate(input.payloadTemplate ?? null),
    };

    this.validateActionConfig(command);

    if (this.repository.findByName(command.name)) {
      throw new Error(`Command "${command.name}" already exists`);
    }

    return this.repository.create(command);
  }

  update(name: string, input: UpdateCustomChatCommandInput): CustomChatCommand | null {
    const normalizedName = this.normalizeName(name);

    const existing = this.repository.findByName(normalizedName);

    if (!existing) {
      return null;
    }

    const updatePayload: UpdateCustomChatCommandInput = {
      ...(input.responseText !== undefined
        ? { responseText: this.validateResponseText(input.responseText) }
        : {}),
      ...(input.cooldownMs !== undefined
        ? { cooldownMs: this.validateCooldownMs(input.cooldownMs) }
        : {}),
      ...(input.replyMode !== undefined
        ? { replyMode: this.validateReplyMode(input.replyMode) }
        : {}),
      ...(input.enabled !== undefined
        ? { enabled: this.validateBoolean(input.enabled, "enabled") }
        : {}),
      ...(input.actionEnabled !== undefined
        ? { actionEnabled: this.validateBoolean(input.actionEnabled, "actionEnabled") }
        : {}),
      ...(input.targetTransports !== undefined
        ? { targetTransports: this.validateTargetTransports(input.targetTransports) }
        : {}),
      ...(input.unrealEventName !== undefined
        ? { unrealEventName: this.validateOptionalEventName(input.unrealEventName, "unrealEventName") }
        : {}),
      ...(input.unityEventName !== undefined
        ? { unityEventName: this.validateOptionalEventName(input.unityEventName, "unityEventName") }
        : {}),
      ...(input.payloadTemplate !== undefined
        ? { payloadTemplate: this.validatePayloadTemplate(input.payloadTemplate) }
        : {}),
    };

    const candidate: CustomChatCommand = {
      ...existing,
      ...updatePayload,
    };

    this.validateActionConfig(candidate);

    return this.repository.update(normalizedName, updatePayload);
  }

  delete(name: string): boolean {
    const normalizedName = this.normalizeName(name);
    return this.repository.delete(normalizedName);
  }

  private normalizeName(name: string): string {
    const trimmed = name.trim().toLowerCase();
    const normalized = trimmed.startsWith("!") ? trimmed.slice(1) : trimmed;

    if (!normalized) {
      throw new Error("Command name is required");
    }

    if (!COMMAND_NAME_REGEX.test(normalized)) {
      throw new Error(
        "Command name must be 2-32 chars and contain only letters, numbers, and underscores",
      );
    }

    return normalized;
  }

  private validateResponseText(responseText: string): string {
    const normalized = responseText.trim();

    if (!normalized) {
      throw new Error("Command responseText is required");
    }

    if (normalized.length > MAX_RESPONSE_LENGTH) {
      throw new Error(`Command responseText must be at most ${MAX_RESPONSE_LENGTH} characters`);
    }

    return normalized;
  }

  private validateCooldownMs(cooldownMs: number): number {
    if (!Number.isFinite(cooldownMs)) {
      throw new Error("cooldownMs must be a valid number");
    }

    const normalized = Math.floor(cooldownMs);

    if (normalized < 0 || normalized > MAX_COOLDOWN_MS) {
      throw new Error(`cooldownMs must be between 0 and ${MAX_COOLDOWN_MS}`);
    }

    return normalized;
  }

  private validateReplyMode(replyMode: "reply" | "normal"): "reply" | "normal" {
    if (replyMode !== "reply" && replyMode !== "normal") {
      throw new Error('replyMode must be either "reply" or "normal"');
    }

    return replyMode;
  }

  private validateBoolean(value: boolean, fieldName: string): boolean {
    if (typeof value !== "boolean") {
      throw new Error(`${fieldName} must be a boolean`);
    }

    return value;
  }

  private validateTargetTransports(
    targetTransports: CustomCommandTargetTransport[],
  ): CustomCommandTargetTransport[] {
    if (!Array.isArray(targetTransports)) {
      throw new Error("targetTransports must be an array");
    }

    const normalized = new Set<CustomCommandTargetTransport>();

    for (const transport of targetTransports) {
      if (transport !== "unreal" && transport !== "unity") {
        throw new Error('targetTransports can contain only "unreal" or "unity"');
      }

      normalized.add(transport);
    }

    return [...normalized];
  }

  private validateOptionalEventName(
    value: string | null,
    fieldName: string,
  ): string | null {
    if (value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new Error(`${fieldName} must be a string or null`);
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    if (normalized.length > MAX_EVENT_NAME_LENGTH) {
      throw new Error(`${fieldName} must be at most ${MAX_EVENT_NAME_LENGTH} characters`);
    }

    return normalized;
  }

  private validatePayloadTemplate(value: unknown | null): unknown | null {
    if (value === null) {
      return null;
    }

    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
      throw new Error("payloadTemplate must be JSON-compatible");
    }

    return JSON.parse(serialized) as unknown;
  }

  private validateActionConfig(command: CustomChatCommand) {
    if (!command.actionEnabled) {
      return;
    }

    const targetTransports = command.targetTransports ?? [];

    if (targetTransports.includes("unity") && !command.unityEventName) {
      throw new Error("unityEventName is required when Unity target is enabled");
    }

    if (targetTransports.includes("unreal") && !command.unrealEventName) {
      throw new Error("unrealEventName is required when Unreal target is enabled");
    }
  }
}
