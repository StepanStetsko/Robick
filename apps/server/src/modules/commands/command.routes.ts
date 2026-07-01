import type { FastifyInstance } from "fastify";
import { CommandsController } from "./CommandsController.js";

export async function commandRoutes(fastify: FastifyInstance) {
  const controller = new CommandsController();

  fastify.get("/commands", controller.getAll.bind(controller));
  fastify.get("/commands/:id", controller.getById.bind(controller));
  fastify.post("/commands", controller.create.bind(controller));
  fastify.patch("/commands/:id", controller.update.bind(controller));
  fastify.delete("/commands/:id", controller.delete.bind(controller));
}