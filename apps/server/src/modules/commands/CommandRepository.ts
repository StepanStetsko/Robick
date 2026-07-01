import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../core/db/PrismaClient.js";

export class CommandRepository {
  findAll() {
    return prisma.command.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return prisma.command.findUnique({
      where: { id },
    });
  }

  create(data: Prisma.CommandCreateInput) {
    return prisma.command.create({ data });
  }

  update(id: string, data: Prisma.CommandUpdateInput) {
    return prisma.command.update({
      where: { id },
      data,
    });
  }

  delete(id: string) {
    return prisma.command.delete({
      where: { id },
    });
  }
}