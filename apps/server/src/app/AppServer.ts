import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { registerRoutes } from "./routes.js";
import { registerAdminAuthGuard } from "../modules/auth/admin-auth.guard.js";

export class AppServer {
  public readonly app = Fastify({
    logger: false,
  });

  async setup() {
    await this.app.register(cors, {
  origin: [env.ADMIN_BASE_URL],
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

    await this.app.register(cookie, {
  secret: env.ADMIN_SESSION_SECRET,
});

    registerAdminAuthGuard(this.app);

    this.app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      message: "Validation error",
      issues: error.issues,
    });
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";

  return reply.status(500).send({
    message,
  });
});

    await this.app.register(sensible);
    await registerRoutes(this.app);
    console.log(this.app.printRoutes());
  }

  async start() {
  const address = await this.app.listen({
    port: env.PORT,
    host: env.HOST,
  });

  console.log("Server listening at:", address);
}
}