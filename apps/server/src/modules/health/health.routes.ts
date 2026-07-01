import type { FastifyInstance } from "fastify";
import { HealthController } from "./HealthController.js";

export async function healthRoutes(fastify: FastifyInstance) {
  const controller = new HealthController();

  fastify.get("/health", controller.getHealth.bind(controller));
}