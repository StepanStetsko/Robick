import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../core/db/PrismaClient.js";

export class HealthController {
  async getHealth(_request: FastifyRequest, reply: FastifyReply) {
    let db = "down";

    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "up";
    } catch {
      db = "down";
    }

    return reply.send({
      ok: true,
      service: "server",
      db,
      timestamp: new Date().toISOString(),
    });
  }
}