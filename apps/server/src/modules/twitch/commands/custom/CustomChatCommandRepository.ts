import fs from "node:fs";
import path from "node:path";
import type {
  CustomChatCommand,
  CustomCommandTargetTransport,
  UpdateCustomChatCommandInput,
} from "./custom-chat-command.types.js";

export class CustomChatCommandRepository {
  private readonly commands = new Map<string, CustomChatCommand>();

  constructor(private readonly storageFilePath: string) {
    this.ensureStorageFile();
    this.loadFromDisk();
  }

  findAll(): CustomChatCommand[] {
    return Array.from(this.commands.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  findByName(name: string): CustomChatCommand | null {
    return this.commands.get(name.trim().toLowerCase()) ?? null;
  }

  create(command: CustomChatCommand): CustomChatCommand {
    const normalizedName = command.name.trim().toLowerCase();

    if (this.commands.has(normalizedName)) {
      throw new Error(`Command "${normalizedName}" already exists`);
    }

    const normalizedCommand = this.normalizeCommand({
      ...command,
      name: normalizedName,
    });

    this.commands.set(normalizedName, normalizedCommand);
    this.saveToDisk();

    return normalizedCommand;
  }

  update(name: string, input: UpdateCustomChatCommandInput): CustomChatCommand | null {
    const normalizedName = name.trim().toLowerCase();
    const existing = this.commands.get(normalizedName);

    if (!existing) {
      return null;
    }

    const updated = this.normalizeCommand({
      ...existing,
      ...input,
      name: normalizedName,
    });

    this.commands.set(normalizedName, updated);
    this.saveToDisk();

    return updated;
  }

  delete(name: string): boolean {
    const deleted = this.commands.delete(name.trim().toLowerCase());

    if (deleted) {
      this.saveToDisk();
    }

    return deleted;
  }

  private ensureStorageFile() {
    const directory = path.dirname(this.storageFilePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(this.storageFilePath)) {
      fs.writeFileSync(this.storageFilePath, "[]", "utf-8");
    }
  }

  private loadFromDisk() {
    const raw = fs.readFileSync(this.storageFilePath, "utf-8");
    const parsed = JSON.parse(raw) as CustomChatCommand[];

    this.commands.clear();

    for (const command of parsed) {
      const normalizedCommand = this.normalizeCommand(command);
      this.commands.set(normalizedCommand.name, normalizedCommand);
    }
  }

  private saveToDisk() {
    const data = JSON.stringify(this.findAll(), null, 2);
    fs.writeFileSync(this.storageFilePath, data, "utf-8");
  }

  private normalizeCommand(command: CustomChatCommand): CustomChatCommand {
    const rawReplyMode = command.replyMode as string;
    const replyMode = rawReplyMode === "normal" || rawReplyMode === "say"
      ? "normal"
      : rawReplyMode === "reply"
        ? "reply"
        : "reply";

    return {
      name: command.name.trim().toLowerCase(),
      responseText: command.responseText.trim(),
      enabled: command.enabled ?? true,
      cooldownMs: command.cooldownMs ?? 5000,
      replyMode,
      actionEnabled: command.actionEnabled ?? false,
      targetTransports: this.normalizeTargetTransports(command.targetTransports),
      unrealEventName: command.unrealEventName ?? null,
      unityEventName: command.unityEventName ?? null,
      payloadTemplate: command.payloadTemplate ?? null,
    };
  }

  private normalizeTargetTransports(
    transports: CustomCommandTargetTransport[] | undefined,
  ): CustomCommandTargetTransport[] {
    const normalized = new Set<CustomCommandTargetTransport>();

    for (const transport of transports ?? []) {
      if (transport === "unreal" || transport === "unity") {
        normalized.add(transport);
      }
    }

    return [...normalized];
  }
}

