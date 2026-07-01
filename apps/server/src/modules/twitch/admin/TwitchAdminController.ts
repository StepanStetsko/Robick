import { CustomChatCommandService } from "../commands/custom/CustomChatCommandService.js";
import { TwitchRuntimeService } from "../TwitchRuntimeService.js";

type CreateCommandBody = {
  name: string;
  responseText: string;
  enabled?: boolean;
  cooldownMs?: number;
  replyMode?: "reply" | "normal";
};

type UpdateCommandBody = {
  responseText?: string;
  enabled?: boolean;
  cooldownMs?: number;
  replyMode?: "reply" | "normal";
};

export class TwitchAdminController {
  constructor(
    private readonly customChatCommandService: CustomChatCommandService,
    private readonly runtimeService: TwitchRuntimeService,
  ) {}

  async getDashboard() {
    const status = await this.runtimeService.getStatus();

    return {
      ok: true,
      data: status,
    };
  }

  async listCommands() {
    return {
      ok: true,
      data: this.customChatCommandService.getAll(),
    };
  }

  async createCommand(body: CreateCommandBody) {
    const command = this.customChatCommandService.create(body);

    return {
      ok: true,
      data: command,
    };
  }

  async updateCommand(name: string, body: UpdateCommandBody) {
    const command = this.customChatCommandService.update(name, body);

    if (!command) {
      return {
        ok: false,
        message: `Command "${name}" not found`,
      };
    }

    return {
      ok: true,
      data: command,
    };
  }

  async deleteCommand(name: string) {
    const deleted = this.customChatCommandService.delete(name);

    if (!deleted) {
      return {
        ok: false,
        message: `Command "${name}" not found`,
      };
    }

    return {
      ok: true,
      data: {
        deleted: true,
        name,
      },
    };
  }
}