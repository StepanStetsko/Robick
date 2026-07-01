import { z } from "zod";
import { prisma } from "../../../core/db/PrismaClient.js";
import { Prisma } from "../../../generated/prisma/client.js";
import type {
  CreateRewardMappingInput,
  RewardMappingDto,
  RewardMappingTargetTransport,
  UpdateRewardMappingInput,
} from "./reward-mapping.types.js";

const targetTransportSchema = z.enum(["unreal", "unity"]);

const optionalEventNameSchema = z.string().trim().min(1).nullable().optional();

const createRewardMappingSchema = z.object({
  rewardId: z.string().trim().min(1, "Reward ID is required"),
  rewardTitle: z.string().trim().min(1, "Reward title is required"),
  enabled: z.boolean().optional(),
  unrealEventName: optionalEventNameSchema,
  unityEventName: optionalEventNameSchema,
  targetTransports: z.array(targetTransportSchema).min(1).optional(),
  payloadTemplate: z.unknown().nullable().optional(),
});

const updateRewardMappingSchema = z.object({
  rewardId: z.string().trim().min(1).optional(),
  rewardTitle: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  unrealEventName: optionalEventNameSchema,
  unityEventName: optionalEventNameSchema,
  targetTransports: z.array(targetTransportSchema).min(1).optional(),
  payloadTemplate: z.unknown().nullable().optional(),
});

function mapPayloadTemplate(
  value: unknown | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function normalizeOptionalEventName(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function toDto(item: {
  id: string;
  rewardId: string;
  rewardTitle: string;
  enabled: boolean;
  unrealEventName: string | null;
  unityEventName: string | null;
  targetTransports: string[];
  payloadTemplate: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}): RewardMappingDto {
  return {
    id: item.id,
    rewardId: item.rewardId,
    rewardTitle: item.rewardTitle,
    enabled: item.enabled,
    unrealEventName: item.unrealEventName,
    unityEventName: item.unityEventName,
    targetTransports: normalizeTargetTransports(item.targetTransports),
    payloadTemplate: item.payloadTemplate,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function normalizeTargetTransports(
  transports: string[] | null | undefined,
): RewardMappingTargetTransport[] {
  const normalized = new Set<RewardMappingTargetTransport>();

  for (const transport of transports ?? []) {
    if (transport === "unreal" || transport === "unity") {
      normalized.add(transport);
    }
  }

  return normalized.size > 0 ? [...normalized] : ["unreal"];
}

function validateTransportEventNames(input: {
  targetTransports: RewardMappingTargetTransport[];
  unrealEventName: string | null;
  unityEventName: string | null;
}) {
  if (input.targetTransports.includes("unreal") && !input.unrealEventName) {
    throw new Error("Unreal event name is required when Unreal target is enabled");
  }

  if (input.targetTransports.includes("unity") && !input.unityEventName) {
    throw new Error("Unity event name is required when Unity target is enabled");
  }
}

export class RewardMappingService {
  async getAll(): Promise<RewardMappingDto[]> {
    const items = await prisma.rewardMapping.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return items.map(toDto);
  }

  async getByRewardId(rewardId: string) {
    return prisma.rewardMapping.findUnique({
      where: { rewardId },
    });
  }

  async create(input: CreateRewardMappingInput): Promise<RewardMappingDto> {
    const data = createRewardMappingSchema.parse(input);
    const targetTransports = data.targetTransports
      ? normalizeTargetTransports(data.targetTransports)
      : (["unreal"] satisfies RewardMappingTargetTransport[]);
    const unrealEventName = normalizeOptionalEventName(data.unrealEventName);
    const unityEventName = normalizeOptionalEventName(data.unityEventName);

    validateTransportEventNames({
      targetTransports,
      unrealEventName,
      unityEventName,
    });

    const created = await prisma.rewardMapping.create({
      data: {
        rewardId: data.rewardId,
        rewardTitle: data.rewardTitle,
        enabled: data.enabled ?? true,
        unrealEventName,
        unityEventName,
        targetTransports,
        payloadTemplate: mapPayloadTemplate(data.payloadTemplate),
      },
    });

    return toDto(created);
  }

  async update(
    id: string,
    input: UpdateRewardMappingInput,
  ): Promise<RewardMappingDto | null> {
    const data = updateRewardMappingSchema.parse(input);

    const existing = await prisma.rewardMapping.findUnique({
      where: { id },
    });

    if (!existing) {
      return null;
    }

    const targetTransports = data.targetTransports
      ? normalizeTargetTransports(data.targetTransports)
      : normalizeTargetTransports(existing.targetTransports);
    const unrealEventName = data.unrealEventName !== undefined
      ? normalizeOptionalEventName(data.unrealEventName)
      : existing.unrealEventName;
    const unityEventName = data.unityEventName !== undefined
      ? normalizeOptionalEventName(data.unityEventName)
      : existing.unityEventName;

    validateTransportEventNames({
      targetTransports,
      unrealEventName,
      unityEventName,
    });

    const updated = await prisma.rewardMapping.update({
      where: { id },
      data: {
        rewardId: data.rewardId,
        rewardTitle: data.rewardTitle,
        enabled: data.enabled,
        unrealEventName,
        unityEventName,
        targetTransports,
        payloadTemplate: mapPayloadTemplate(data.payloadTemplate),
      },
    });

    return toDto(updated);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await prisma.rewardMapping.findUnique({
      where: { id },
    });

    if (!existing) {
      return false;
    }

    await prisma.rewardMapping.delete({
      where: { id },
    });

    return true;
  }
}

