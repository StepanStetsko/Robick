import { Prisma } from "@prisma/client";
import { z } from "zod";

type JsonInput = Prisma.InputJsonValue | null;

const jsonSchema: z.ZodType<JsonInput> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

export const createCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  cooldownMs: z.number().int().min(0).optional(),
  allowedRoles: z.array(z.string()).default([]),
  unrealEventName: z.string().min(1),
  payloadTemplate: jsonSchema.optional(),
});

export const updateCommandSchema = createCommandSchema.partial();