import { AppServer } from "./app/AppServer.js";
import { logger } from "./core/logger/logger.js";
import { createTokenRefreshService } from "./modules/auth/TokenRefreshService.js";

async function bootstrap() {
  const tokenRefreshService = createTokenRefreshService();

  try {
    const server = new AppServer();
    await server.setup();
    await server.start();

    await tokenRefreshService.refreshAllSafely();
    tokenRefreshService.start();

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      tokenRefreshService.stop();
      process.exit(0);
    };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    logger.info("Server started", {
      port: process.env.PORT ?? 4000,
    });
  } catch (error) {
    tokenRefreshService.stop();
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

void bootstrap();