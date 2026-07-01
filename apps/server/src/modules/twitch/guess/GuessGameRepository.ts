import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  GuessGameSettings,
  PrismaClient,
} from "../../../generated/prisma/client.js";
import {
  GUESS_GAME_SETTINGS_KEY,
  defaultGuessGameMessages,
  type UpdateGuessGameSettingsInput,
} from "./guess.types.js";

export class GuessGameRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getSettingsRow(): Promise<GuessGameSettings> {
    const existing = await this.db.guessGameSettings.findUnique({
      where: { key: GUESS_GAME_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.guessGameSettings.create({
      data: {
        key: GUESS_GAME_SETTINGS_KEY,
        messages:
          defaultGuessGameMessages as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateSettings(
    input: UpdateGuessGameSettingsInput,
  ): Promise<GuessGameSettings> {
    await this.getSettingsRow();

    return this.db.guessGameSettings.update({
      where: { key: GUESS_GAME_SETTINGS_KEY },
      data: {
        ...(input.command !== undefined ? { command: input.command } : {}),
        ...(input.stopCommand !== undefined
          ? { stopCommand: input.stopCommand }
          : {}),
        ...(input.reward !== undefined ? { reward: input.reward } : {}),
        ...(input.maxRange !== undefined ? { maxRange: input.maxRange } : {}),
        ...(input.maxDurationSeconds !== undefined
          ? { maxDurationSeconds: input.maxDurationSeconds }
          : {}),
        ...(input.messages !== undefined
          ? { messages: input.messages as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
