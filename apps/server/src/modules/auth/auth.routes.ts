import type { FastifyInstance } from "fastify";
import { AuthController } from "./AuthController.js";

export async function authRoutes(fastify: FastifyInstance) {
  const controller = new AuthController();

  fastify.get("/auth/twitch/login", controller.login.bind(controller));
  fastify.get("/auth/twitch/callback", controller.callback.bind(controller));
  fastify.get("/auth/status", controller.status.bind(controller));
  fastify.post("/auth/refresh", controller.refresh.bind(controller));

  // Admin-panel access control (Twitch login + allowlist).
  fastify.get("/auth/admin/login", controller.adminLogin.bind(controller));
  fastify.get("/auth/admin/me", controller.adminMe.bind(controller));
  fastify.post("/auth/admin/logout", controller.adminLogout.bind(controller));
}