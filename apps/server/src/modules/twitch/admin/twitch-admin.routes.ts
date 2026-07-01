import type { FastifyInstance } from "fastify";
import { twitchRuntimeContainer } from "../TwitchRuntimeContainer.js";
import { TwitchAdminController } from "./TwitchAdminController.js";

const controller = new TwitchAdminController(
  twitchRuntimeContainer.customChatCommandService,
  twitchRuntimeContainer.runtimeService,
);

export async function twitchAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/twitch/dashboard", async () => {
    return controller.getDashboard();
  });

  app.get("/api/admin/twitch/commands", async () => {
    return controller.listCommands();
  });

  app.post("/api/admin/twitch/commands", async (request, reply) => {
    try {
      return await controller.createCommand(
        request.body as {
          name: string;
          responseText: string;
          enabled?: boolean;
          cooldownMs?: number;
          replyMode?: "reply" | "normal";
        },
      );
    } catch (error) {
      reply.code(400);

      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid request",
      };
    }
  });

  app.patch("/api/admin/twitch/commands/:name", async (request, reply) => {
    try {
      const params = request.params as { name: string };

      const result = await controller.updateCommand(
        params.name,
        request.body as {
          responseText?: string;
          enabled?: boolean;
          cooldownMs?: number;
          replyMode?: "reply" | "normal";
        },
      );

      if (!result.ok) {
        reply.code(404);
      }

      return result;
    } catch (error) {
      reply.code(400);

      return {
        ok: false,
        message: error instanceof Error ? error.message : "Invalid request",
      };
    }
  });

  app.delete("/api/admin/twitch/commands/:name", async (request, reply) => {
    const params = request.params as { name: string };

    const result = await controller.deleteCommand(params.name);

    if (!result.ok) {
      reply.code(404);
    }

    return result;
  });
}