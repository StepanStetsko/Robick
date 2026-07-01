import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CommandRepository } from "./CommandRepository.js";
import { CommandService } from "./CommandService.js";
import { createCommandSchema, updateCommandSchema } from "./command.schemas.js";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export class CommandsController {
  private readonly service = new CommandService(new CommandRepository());

  async getAll(_request: FastifyRequest, reply: FastifyReply) {
    const commands = await this.service.getAll();
    return reply.send(commands);
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = paramsSchema.parse(request.params);
    const command = await this.service.getById(id);

    if (!command) {
      return reply.status(404).send({ message: "Command not found" });
    }

    return reply.send(command);
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createCommandSchema.parse(request.body);
    const command = await this.service.create(body);

    return reply.status(201).send(command);
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = paramsSchema.parse(request.params);
    const body = updateCommandSchema.parse(request.body);

    const command = await this.service.update(id, body);
    return reply.send(command);
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = paramsSchema.parse(request.params);

    await this.service.delete(id);
    return reply.status(204).send();
  }
}