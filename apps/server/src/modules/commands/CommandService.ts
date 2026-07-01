import { Prisma } from "../../generated/prisma/client";
import { CommandRepository } from "./CommandRepository.js";

type CreateCommandInput = {
  name: string;
  description?: string;
  enabled?: boolean;
  cooldownMs?: number;
  allowedRoles?: string[];
  unrealEventName: string;
  payloadTemplate?: Prisma.InputJsonValue | null;
};

type UpdateCommandInput = Partial<CreateCommandInput>;

export class CommandService {
  constructor(private readonly repository: CommandRepository) {}

  getAll() {
    return this.repository.findAll();
  }

  getById(id: string) {
    return this.repository.findById(id);
  }

  create(input: CreateCommandInput) {
    return this.repository.create({
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      cooldownMs: input.cooldownMs ?? 0,
      allowedRoles: input.allowedRoles ?? [],
      unrealEventName: input.unrealEventName,
      payloadTemplate:
        input.payloadTemplate === undefined
          ? undefined
          : input.payloadTemplate === null
            ? Prisma.DbNull
            : input.payloadTemplate,
    });
  }

  update(id: string, input: UpdateCommandInput) {
    return this.repository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.cooldownMs !== undefined ? { cooldownMs: input.cooldownMs } : {}),
      ...(input.allowedRoles !== undefined ? { allowedRoles: input.allowedRoles } : {}),
      ...(input.unrealEventName !== undefined
        ? { unrealEventName: input.unrealEventName }
        : {}),
      ...(input.payloadTemplate !== undefined
        ? {
            payloadTemplate:
              input.payloadTemplate === null
                ? Prisma.DbNull
                : input.payloadTemplate,
          }
        : {}),
    });
  }

  delete(id: string) {
    return this.repository.delete(id);
  }
}