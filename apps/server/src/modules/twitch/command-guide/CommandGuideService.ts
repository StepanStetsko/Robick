import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { EconomyService } from "../economy/EconomyService.js";
import type { FunMeterService } from "../fun-meter/FunMeterService.js";
import type { GiveawayService } from "../giveaway/GiveawayService.js";
import type { GuessGameService } from "../guess/GuessGameService.js";
import {
  COMMAND_GUIDE_KEY,
  saveCommandGuideSchema,
  type CommandGuide,
  type GuideGroup,
} from "./command-guide.types.js";

/**
 * Stores an editable command guide (the public "Довідник команд") in AppSetting.
 * The guide can be (re)generated from the current bot settings — command names
 * follow the DB-configured names — and then freely edited by authorized users.
 */
export class CommandGuideService {
  constructor(
    private readonly economyService: EconomyService,
    private readonly funMeterService: FunMeterService,
    private readonly giveawayService: GiveawayService,
    private readonly guessGameService: GuessGameService,
    private readonly db: PrismaClient = prisma,
  ) {}

  /**
   * Returns the saved guide, or — if none was ever saved — a fresh guide
   * generated from the current settings (with updatedAt = null).
   */
  async getGuide(): Promise<CommandGuide> {
    const row = await this.db.appSetting.findUnique({
      where: { key: COMMAND_GUIDE_KEY },
    });

    if (row && isStoredGuide(row.value)) {
      return {
        groups: row.value.groups,
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    return {
      groups: await this.generateFromSettings(),
      updatedAt: null,
    };
  }

  async save(input: unknown): Promise<CommandGuide> {
    const parsed = saveCommandGuideSchema.parse(input);

    const row = await this.db.appSetting.upsert({
      where: { key: COMMAND_GUIDE_KEY },
      create: {
        key: COMMAND_GUIDE_KEY,
        value: { groups: parsed.groups } as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: { groups: parsed.groups } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      groups: parsed.groups,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Regenerate from settings and persist, replacing any manual edits. */
  async regenerate(): Promise<CommandGuide> {
    const groups = await this.generateFromSettings();
    return this.save({ groups });
  }

  async generateFromSettings(): Promise<GuideGroup[]> {
    const [economy, features, giveaway, guess] = await Promise.all([
      this.economyService.getSettings(),
      this.funMeterService.listFeatures(),
      this.giveawayService.getSettings(),
      this.guessGameService.getSettings(),
    ]);

    const groups: GuideGroup[] = [];

    groups.push({
      title: "Економіка",
      rows: [
        {
          command: `!${economy.balanceCommand}`,
          description: "Показати свій баланс і позицію в рейтингу",
        },
        { command: `!${economy.topCommand}`, description: "Топ глядачів за балансом" },
        {
          command: `!${economy.giveCommand} @нік <сума>`,
          description: "Передати балі іншому глядачу",
        },
        {
          command: `!${economy.statusCommand}`,
          description: "Профіль: баланс + активні бафи й дебафи",
        },
        {
          command: `!${economy.helpCommand}`,
          description: "Список усіх доступних команд",
        },
      ],
    });

    groups.push({
      title: "Рулетка та бійки",
      rows: [
        {
          command: `!${economy.rouletteCommand} <ставка|all|NN%>`,
          description:
            "Гра на ставку 1:1 (виграш додається, програш забирає). Шанс випадковий у діапазоні; є кулдаун. Топ-1 крутить лише all-in",
        },
        {
          command: `!${economy.fightCommand} @нік <ставка|all|NN%>`,
          description: `Виклик на бій за бали; суперник пише !${economy.fightAcceptCommand}. Переможець забирає ставку`,
        },
      ],
    });

    groups.push({
      title: "Ефекти (бафи / дебафи)",
      rows: [
        {
          command: `!${economy.buffRollCommand}`,
          description: `Крутити випадковий баф або дебаф за ${economy.buffRollCost} ${economy.unit}`,
        },
        { command: `!${economy.buffListCommand}`, description: "Список можливих ефектів" },
      ],
    });

    groups.push({
      title: "Крадіжка",
      rows: [
        {
          command: `!${economy.stealCommand} @нік`,
          description:
            "Вкрасти бали в люркера, що зараз у чаті (шанс на провал зі штрафом)",
        },
        {
          command: `!${economy.shieldCommand}`,
          description: `Купити захист від крадіжки на ${economy.shieldDurationMin} хв за ${economy.shieldCost} ${economy.unit}`,
        },
      ],
    });

    const featureRows = features
      .filter((feature) => feature.enabled)
      .map((feature) => {
        const aliases = feature.aliases.length > 0 ? feature.aliases : [feature.key];
        const subParts: string[] = [];

        if (feature.leaderboardArgs[0]) {
          subParts.push(`"${feature.leaderboardArgs[0]}" — топ`);
        }

        if (feature.selfArgs[0]) {
          subParts.push(`"${feature.selfArgs[0]}" — свій результат`);
        }

        const suffix = subParts.length > 0 ? ` (${subParts.join(", ")})` : "";

        return {
          command: aliases.map((alias) => `!${alias}`).join(" / "),
          description: `${feature.title} — крутити очки${suffix}`,
        };
      });

    if (featureRows.length > 0) {
      groups.push({ title: "Фан-метр", rows: featureRows });
    }

    groups.push({
      title: "Розіграш",
      rows: [
        {
          command: giveaway.joinKeyword,
          description: "Слово для приєднання до активного розіграшу",
        },
        ...giveaway.presets
          .filter((preset) => preset.enabled)
          .map((preset) => ({
            command: `!${preset.commandName} <сума>`,
            description: "Запустити розіграш (тільки модератор / стрімер)",
          })),
        {
          command: `!${giveaway.selfCommand} <сума>`,
          description:
            "Розіграти власні бали (списуються з балансу; повертаються, якщо ніхто не приєднався)",
        },
      ],
    });

    groups.push({
      title: "Вгадай число",
      rows: [
        {
          command: `!${guess.command} <від> <до> [час_с]`,
          description: `Запустити гру (тільки модератор / стрімер). Перший, хто вгадає число, отримає ${guess.reward} ${economy.unit}`,
        },
        {
          command: `!${guess.stopCommand}`,
          description: "Зупинити активну гру (тільки модератор / стрімер)",
        },
        {
          command: "<число>",
          description: "Під час гри напиши число в чат, щоб вгадати",
        },
      ],
    });

    return groups;
  }
}

type StoredGuide = { groups: GuideGroup[] };

function isStoredGuide(value: unknown): value is StoredGuide {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { groups?: unknown }).groups)
  );
}
