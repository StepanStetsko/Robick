import type { FastifyInstance } from "fastify";
import { healthRoutes } from "../modules/health/health.routes.js";
import { commandRoutes } from "../modules/commands/command.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { twitchRoutes } from "../modules/twitch/twitch.routes.js";
import { twitchAdminRoutes } from "../modules/twitch/admin/twitch-admin.routes.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
  await app.register(commandRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(twitchRoutes, { prefix: "/api" });
  await app.register(twitchAdminRoutes);
}