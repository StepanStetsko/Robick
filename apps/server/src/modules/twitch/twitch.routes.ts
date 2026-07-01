import type { FastifyInstance, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { twitchRuntimeContainer } from "./TwitchRuntimeContainer.js";
import { twitchEventLog } from "./events/twitch-event-log.js";
import type {
  CreateCustomChatCommandInput,
  UpdateCustomChatCommandInput,
} from "./commands/custom/custom-chat-command.types.js";
import type {
  CreateRewardMappingInput,
  UpdateRewardMappingInput,
} from "./rewards/reward-mapping.types.js";
import { PENIS_METER_FEATURE_KEY } from "./fun-meter/fun-meter.types.js";
import type {
  CreateFunMeterFeatureInput,
  UpdateFunMeterFeatureInput,
} from "./fun-meter/fun-meter.types.js";
import type { UpdateEconomySettingsInput } from "./economy/economy.types.js";
import type {
  CreateBuffDefinitionInput,
  UpdateBuffDefinitionInput,
} from "./buffs/buff.types.js";
import type { UpdateGiveawaySettingsInput } from "./giveaway/giveaway.types.js";
import type { UpdateGuessGameSettingsInput } from "./guess/guess.types.js";
import type { UpdateSongRequestSettingsInput } from "./song-request/song-request.types.js";
import type { UpdateSupporterSettingsInput } from "./supporter/supporter.types.js";
import type { SimulateChatInput } from "./simulation/ChatSimulationService.js";
import { AccountType } from "../../generated/prisma/client.js";
import { twitchRealtimeHub } from "./realtime/twitch-realtime-hub.js";
import { commandUsageHistory } from "./commands/CommandUsageHistory.js";
import { rewardQueueStore } from "./rewards/RewardQueueStore.js";
import { rewardHistoryStore } from "./rewards/RewardHistoryStore.js";

async function buildAuthStatus() {
  const [broadcaster, bot] = await Promise.all([
    twitchRuntimeContainer.authRepository.findAccountByType(AccountType.broadcaster),
    twitchRuntimeContainer.authRepository.findAccountByType(AccountType.bot),
  ]);

  return {
    broadcaster: broadcaster
      ? {
          connected: true,
          id: broadcaster.id,
          providerUserId: broadcaster.providerUserId,
          login: broadcaster.login,
          displayName: broadcaster.displayName,
          scopes: broadcaster.oauthToken?.scopes ?? [],
          expiresAt: broadcaster.oauthToken?.expiresAt ?? null,
        }
      : { connected: false },
    bot: bot
      ? {
          connected: true,
          id: bot.id,
          providerUserId: bot.providerUserId,
          login: bot.login,
          displayName: bot.displayName,
          scopes: bot.oauthToken?.scopes ?? [],
          expiresAt: bot.oauthToken?.expiresAt ?? null,
        }
      : { connected: false },
  };
}

function writeSseEvent(reply: FastifyReply, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseLimit(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : fallback;

  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(100, Math.floor(parsed)))
    : fallback;
}

export async function twitchRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { limit?: string };
  }>("/twitch/events", async (request) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;

    return {
      ok: true,
      data: twitchEventLog.list(limit),
    };
  });

  app.post("/twitch/events/clear", async () => {
    twitchEventLog.clear();

    twitchEventLog.add({
      source: "admin",
      type: "events.cleared",
      message: "Event log cleared from admin panel",
    });

    return {
      ok: true,
    };
  });

  app.get("/twitch/realtime/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // Must echo the specific origin (not "*") because the EventSource sends
      // credentials (the admin session cookie).
      "Access-Control-Allow-Origin": env.ADMIN_BASE_URL,
      "Access-Control-Allow-Credentials": "true",
    });

    const snapshot = {
      runtime: await twitchRuntimeContainer.runtimeService.getStatus(),
      engineTransports: {
        unreal: twitchRuntimeContainer.unrealWebSocketServer.getStatus(),
        unity: twitchRuntimeContainer.unityWebSocketServer.getStatus(),
      },
      engineCapabilities: {
        unity: twitchRuntimeContainer.unityWebSocketServer.getCapabilities(),
      },
      queue: twitchRuntimeContainer.rewardRedemptionHandler.getQueueStatus(),
      events: twitchEventLog.list(100),
      auth: await buildAuthStatus(),
      commands: twitchRuntimeContainer.customChatCommandService.getAll(),
      commandHistory: commandUsageHistory.list(50),
      rewardQueue: rewardQueueStore.list(),
      rewardHistory: rewardHistoryStore.list(50),
    };

    writeSseEvent(reply, "snapshot", snapshot);

    const unsubscribe = twitchRealtimeHub.subscribe((message) => {
      writeSseEvent(reply, message.event, message.data);
    });

    const keepAlive = setInterval(() => {
      writeSseEvent(reply, "ping", {
        timestamp: new Date().toISOString(),
      });
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      reply.raw.end();
    });

    request.raw.on("error", () => {
      clearInterval(keepAlive);
      unsubscribe();
      reply.raw.end();
    });
  });

  app.post("/twitch/runtime/start", async () => {
    await twitchRuntimeContainer.runtimeService.start();
    const status = await twitchRuntimeContainer.runtimeService.getStatus();

    twitchEventLog.add({
      source: "runtime",
      type: "runtime.started",
      message: "Twitch runtime started",
      data: {
        runtimeStarted: status.runtimeStarted,
        broadcasterConnected: status.broadcasterConnected,
        botConnected: status.botConnected,
      },
    });

    return {
      ok: true,
      data: status,
    };
  });

  app.get("/twitch/runtime/status", async () => {
    const status = await twitchRuntimeContainer.runtimeService.getStatus();

    return {
      ok: true,
      data: status,
    };
  });

  app.get("/twitch/engine/status", async () => {
    return {
      ok: true,
      data: {
        unreal: twitchRuntimeContainer.unrealWebSocketServer.getStatus(),
        unity: twitchRuntimeContainer.unityWebSocketServer.getStatus(),
      },
    };
  });
  app.get("/twitch/engine/unity/capabilities", async () => {
    return {
      ok: true,
      data: twitchRuntimeContainer.unityWebSocketServer.getCapabilities(),
    };
  });

  app.post<{
    Body: { eventName?: string; payload?: Record<string, unknown> };
  }>("/twitch/engine/unity/dispatch", async (request, reply) => {
    const eventName = request.body?.eventName?.trim();

    if (!eventName) {
      reply.code(400);

      return {
        ok: false,
        message: "eventName is required",
      };
    }

    const message = {
      type: "admin_action_dispatch" as const,
      transport: "unity" as const,
      eventId: `admin-${crypto.randomUUID()}`,
      eventName,
      payload: request.body?.payload ?? {},
      timestamp: new Date().toISOString(),
    };

    const deliveredCount = twitchRuntimeContainer.unityWebSocketServer.broadcastAdminActionDispatch(message);

    twitchEventLog.add({
      source: "admin",
      type: "unity.admin_action_dispatch",
      message: `Admin action dispatched to Unity: ${eventName}`,
      data: {
        eventId: message.eventId,
        eventName,
        deliveredCount,
      },
    });

    return {
      ok: true,
      data: {
        eventId: message.eventId,
        eventName,
        deliveredCount,
      },
    };
  });

  app.post("/twitch/runtime/stop", async () => {
    const status = await twitchRuntimeContainer.runtimeService.stop();

    twitchEventLog.add({
      source: "runtime",
      type: "runtime.stopped",
      message: "Twitch runtime stopped",
      data: {
        runtimeStarted: status.runtimeStarted,
        broadcasterConnected: status.broadcasterConnected,
        botConnected: status.botConnected,
      },
    });

    return {
      ok: true,
      data: status,
    };
  });

  app.get("/twitch/fun-meter/features", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.funMeterService.listFeatures(),
    };
  });

  app.post<{
    Body: CreateFunMeterFeatureInput;
  }>("/twitch/fun-meter/features", async (request, reply) => {
    try {
      const feature = await twitchRuntimeContainer.funMeterService.createFeature(
        request.body,
      );

      reply.code(201);

      return {
        ok: true,
        data: feature,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create fun meter";

      reply.code(message.includes("already used") ? 409 : 400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.patch<{
    Params: { featureKey: string };
    Body: UpdateFunMeterFeatureInput;
  }>("/twitch/fun-meter/features/:featureKey", async (request, reply) => {
    try {
      const feature = await twitchRuntimeContainer.funMeterService.updateFeature(
        request.params.featureKey,
        request.body,
      );

      if (!feature) {
        reply.code(404);

        return {
          ok: false,
          message: "Fun meter feature not found",
        };
      }

      return {
        ok: true,
        data: feature,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update fun meter";

      reply.code(message.includes("already used") ? 409 : 400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get<{
    Params: { featureKey: string };
    Querystring: { limit?: string };
  }>("/twitch/fun-meter/features/:featureKey/leaderboard", async (request) => {
    const limit = parseLimit(request.query.limit, 10);
    const leaderboard =
      await twitchRuntimeContainer.funMeterService.getLeaderboard(
        request.params.featureKey,
        limit,
      );

    return {
      ok: true,
      data: leaderboard,
    };
  });

  app.get<{
    Params: { featureKey: string };
    Querystring: { limit?: string };
  }>("/twitch/fun-meter/features/:featureKey/viewers", async (request) => {
    const limit = parseLimit(request.query.limit, 50);
    const viewers = await twitchRuntimeContainer.funMeterService.listViewers(
      request.params.featureKey,
      limit,
    );

    return {
      ok: true,
      data: viewers,
    };
  });

  app.post<{
    Params: { featureKey: string };
    Body: {
      twitchUserId?: string;
      userLogin?: string;
      displayName?: string;
    };
  }>("/twitch/fun-meter/features/:featureKey/test-roll", async (request) => {
    const result = await twitchRuntimeContainer.funMeterService.rollViewer(
      request.params.featureKey,
      {
        twitchUserId: request.body?.twitchUserId?.trim() || "test-user-id",
        userLogin: request.body?.userLogin?.trim() || "test_viewer",
        displayName: request.body?.displayName?.trim() || "Test Viewer",
      },
      { source: "admin.test" },
    );

    return {
      ok: true,
      data: result,
    };
  });

  app.post<{
    Params: { featureKey: string };
    Body: { twitchUserId?: string };
  }>("/twitch/fun-meter/features/:featureKey/reset-user", async (request, reply) => {
    const twitchUserId = request.body?.twitchUserId?.trim();

    if (!twitchUserId) {
      reply.code(400);

      return {
        ok: false,
        message: "twitchUserId is required",
      };
    }

    const result = await twitchRuntimeContainer.funMeterService.resetUser(
      request.params.featureKey,
      twitchUserId,
    );

    return {
      ok: true,
      data: result,
    };
  });

  app.get<{
    Querystring: { limit?: string };
  }>("/twitch/fun-meter/penis/leaderboard", async (request) => {
    const limit = parseLimit(request.query.limit, 10);
    const leaderboard =
      await twitchRuntimeContainer.funMeterService.getLeaderboard(
        PENIS_METER_FEATURE_KEY,
        limit,
      );

    return {
      ok: true,
      data: leaderboard,
    };
  });

  app.get<{
    Querystring: { limit?: string };
  }>("/twitch/fun-meter/penis/viewers", async (request) => {
    const limit = parseLimit(request.query.limit, 50);
    const viewers = await twitchRuntimeContainer.funMeterService.listViewers(
      PENIS_METER_FEATURE_KEY,
      limit,
    );

    return {
      ok: true,
      data: viewers,
    };
  });

  app.post<{
    Body: {
      twitchUserId?: string;
      userLogin?: string;
      displayName?: string;
    };
  }>("/twitch/fun-meter/penis/test-roll", async (request) => {
    const result = await twitchRuntimeContainer.funMeterService.rollViewer(
      PENIS_METER_FEATURE_KEY,
      {
        twitchUserId: request.body?.twitchUserId?.trim() || "test-user-id",
        userLogin: request.body?.userLogin?.trim() || "test_viewer",
        displayName: request.body?.displayName?.trim() || "Test Viewer",
      },
      { source: "admin.test" },
    );

    return {
      ok: true,
      data: result,
    };
  });

  app.post<{
    Body: { twitchUserId?: string };
  }>("/twitch/fun-meter/penis/reset-user", async (request, reply) => {
    const twitchUserId = request.body?.twitchUserId?.trim();

    if (!twitchUserId) {
      reply.code(400);

      return {
        ok: false,
        message: "twitchUserId is required",
      };
    }

    const result =
      await twitchRuntimeContainer.funMeterService.resetUser(
        PENIS_METER_FEATURE_KEY,
        twitchUserId,
      );

    return {
      ok: true,
      data: result,
    };
  });

  app.post("/twitch/fun-meter/penis/reset-all", async () => {
    const result = await twitchRuntimeContainer.funMeterService.resetAll(
      PENIS_METER_FEATURE_KEY,
    );

    return {
      ok: true,
      data: result,
    };
  });

    app.post<{
    Body: { message: string };
  }>("/twitch/chat/send", async (request, reply) => {
    const message = request.body?.message?.trim();

    if (!message) {
      reply.code(400);

      return {
        ok: false,
        message: "Message is required",
      };
    }

    try {
      await twitchRuntimeContainer.twitchChatService.sendMessage(message);

      twitchEventLog.add({
        source: "admin",
        type: "chat.message_sent",
        message: "Bot message sent from admin panel",
        data: {
          message,
        },
      });

      return {
        ok: true,
        data: {
          sent: true,
          message,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send chat message";

      twitchEventLog.add({
        level: "error",
        source: "admin",
        type: "chat.message_send_failed",
        message: errorMessage,
        data: {
          message,
        },
      });

      reply.code(400);

      return {
        ok: false,
        message: errorMessage,
      };
    }
  });

 app.get("/twitch/rewards/queue", async () => {
  return {
    ok: true,
    data: rewardQueueStore.list(),
  };
});

app.get<{
  Querystring: { limit?: string };
}>("/twitch/rewards/history", async (request) => {
  const rawLimit = request.query.limit;
  const parsedLimit = rawLimit ? Number(rawLimit) : 50;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;

  return {
    ok: true,
    data: rewardHistoryStore.list(limit),
  };
});

app.post<{
  Body: {
    rewardId: string;
    userInput?: string;
    userLogin?: string;
    userName?: string;
  };
}>("/twitch/rewards/test-dispatch", async (request, reply) => {
  const rewardId = request.body?.rewardId?.trim();

  if (!rewardId) {
    reply.code(400);

    return {
      ok: false,
      message: "rewardId is required",
    };
  }

  const mapping = await twitchRuntimeContainer.rewardMappingService.getByRewardId(
    rewardId,
  );

  if (!mapping) {
    reply.code(404);

    return {
      ok: false,
      message: "Reward mapping not found",
    };
  }

  const redemptionId = `test-${crypto.randomUUID()}`;

  await twitchRuntimeContainer.rewardRedemptionHandler.handle({
    id: redemptionId,
    broadcaster_user_id: "test-broadcaster-id",
    broadcaster_user_login: "test_broadcaster",
    broadcaster_user_name: "Test Broadcaster",
    user_id: "test-user-id",
    user_login: request.body?.userLogin?.trim() || "test_viewer",
    user_name: request.body?.userName?.trim() || "Test Viewer",
    user_input: request.body?.userInput ?? "",
    status: "fulfilled",
    reward: {
      id: mapping.rewardId,
      title: mapping.rewardTitle,
      cost: 0,
      prompt: "Local test dispatch",
    },
    redeemed_at: new Date().toISOString(),
  }, { waitForProcessing: true });

  return {
    ok: true,
    data: {
      redemptionId,
      rewardId,
      queued: false,
      dispatched: true,
    },
  };
});

  app.get("/twitch/commands/custom", async () => {
    const commands = twitchRuntimeContainer.customChatCommandService.getAll();

    return {
      ok: true,
      data: commands,
    };
  });

  app.get<{
    Querystring: { limit?: string };
  }>("/twitch/commands/custom/history", async (request) => {
    const limit = request.query.limit ? Number(request.query.limit) : 50;

    return {
      ok: true,
      data: commandUsageHistory.list(limit),
    };
  });

  app.post<{ Body: CreateCustomChatCommandInput }>(
    "/twitch/commands/custom",
    async (request, reply) => {
      try {
        const command = twitchRuntimeContainer.customChatCommandService.create(
          request.body,
        );

        twitchRealtimeHub.publish(
          "commands.changed",
          twitchRuntimeContainer.customChatCommandService.getAll(),
        );

        twitchEventLog.add({
          source: "admin",
          type: "command.created",
          message: `Custom command created: !${command.name}`,
          data: {
            name: command.name,
            enabled: command.enabled,
            cooldownMs: command.cooldownMs,
            replyMode: command.replyMode,
          },
        });

        reply.code(201);

        return {
          ok: true,
          data: command,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create command";

        twitchEventLog.add({
          level: "error",
          source: "admin",
          type: "command.create_failed",
          message,
          data: {
            body: request.body as Record<string, unknown>,
          },
        });

        if (message.includes("already exists")) {
          reply.code(409);
        } else {
          reply.code(400);
        }

        return {
          ok: false,
          message,
        };
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: UpdateCustomChatCommandInput;
  }>("/twitch/commands/custom/:id", async (request, reply) => {
    try {
      const command = twitchRuntimeContainer.customChatCommandService.update(
        request.params.id,
        request.body,
      );

      if (!command) {
        reply.code(404);

        twitchEventLog.add({
          level: "warn",
          source: "admin",
          type: "command.update_missing",
          message: `Custom command not found: ${request.params.id}`,
          data: {
            id: request.params.id,
          },
        });

        return {
          ok: false,
          message: "Command not found",
        };
      }

      twitchRealtimeHub.publish(
        "commands.changed",
        twitchRuntimeContainer.customChatCommandService.getAll(),
      );

      twitchEventLog.add({
        source: "admin",
        type: "command.updated",
        message: `Custom command updated: !${command.name}`,
        data: {
          name: command.name,
          enabled: command.enabled,
          cooldownMs: command.cooldownMs,
          replyMode: command.replyMode,
        },
      });

      return {
        ok: true,
        data: command,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update command";

      twitchEventLog.add({
        level: "error",
        source: "admin",
        type: "command.update_failed",
        message,
        data: {
          id: request.params.id,
          body: request.body as Record<string, unknown>,
        },
      });

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/twitch/commands/custom/:id",
    async (request, reply) => {
      try {
        const deleted = twitchRuntimeContainer.customChatCommandService.delete(
          request.params.id,
        );

        if (!deleted) {
          reply.code(404);

          twitchEventLog.add({
            level: "warn",
            source: "admin",
            type: "command.delete_missing",
            message: `Custom command not found: ${request.params.id}`,
            data: {
              id: request.params.id,
            },
          });

          return {
            ok: false,
            message: "Command not found",
          };
        }

        twitchRealtimeHub.publish(
          "commands.changed",
          twitchRuntimeContainer.customChatCommandService.getAll(),
        );

        twitchEventLog.add({
          source: "admin",
          type: "command.deleted",
          message: `Custom command deleted: !${request.params.id}`,
          data: {
            id: request.params.id,
          },
        });

        return {
          ok: true,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete command";

        twitchEventLog.add({
          level: "error",
          source: "admin",
          type: "command.delete_failed",
          message,
          data: {
            id: request.params.id,
          },
        });

        reply.code(400);

        return {
          ok: false,
          message,
        };
      }
    },
  );

  app.get("/twitch/rewards/catalog", async (_request, reply) => {
    try {
      const catalog = await twitchRuntimeContainer.rewardCatalogService.getCatalog();

      return {
        ok: true,
        data: catalog,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load reward catalog";

      twitchEventLog.add({
        level: "error",
        source: "admin",
        type: "reward_catalog.load_failed",
        message,
      });

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get("/twitch/rewards/mappings", async () => {
    const mappings = await twitchRuntimeContainer.rewardMappingService.getAll();

    return {
      ok: true,
      data: mappings,
    };
  });

  app.post<{ Body: CreateRewardMappingInput }>(
    "/twitch/rewards/mappings",
    async (request, reply) => {
      try {
        const mapping = await twitchRuntimeContainer.rewardMappingService.create(
          request.body,
        );

        twitchEventLog.add({
          source: "admin",
          type: "reward_mapping.created",
          message: `Reward mapping created: ${mapping.rewardTitle}`,
          data: {
            id: mapping.id,
            rewardId: mapping.rewardId,
            rewardTitle: mapping.rewardTitle,
            unrealEventName: mapping.unrealEventName,
            unityEventName: mapping.unityEventName,
            targetTransports: mapping.targetTransports,
            enabled: mapping.enabled,
          },
        });

        reply.code(201);

        return {
          ok: true,
          data: mapping,
        };
      } catch (error) {
        let message =
          error instanceof Error ? error.message : "Failed to create reward mapping";

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          reply.code(409);
          message = "Reward mapping with this rewardId already exists";
        } else {
          reply.code(400);
        }

        twitchEventLog.add({
          level: "error",
          source: "admin",
          type: "reward_mapping.create_failed",
          message,
          data: {
            body: request.body as Record<string, unknown>,
          },
        });

        return {
          ok: false,
          message,
        };
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: UpdateRewardMappingInput;
  }>("/twitch/rewards/mappings/:id", async (request, reply) => {
    try {
      const mapping = await twitchRuntimeContainer.rewardMappingService.update(
        request.params.id,
        request.body,
      );

      if (!mapping) {
        reply.code(404);

        twitchEventLog.add({
          level: "warn",
          source: "admin",
          type: "reward_mapping.update_missing",
          message: `Reward mapping not found: ${request.params.id}`,
          data: {
            id: request.params.id,
          },
        });

        return {
          ok: false,
          message: "Reward mapping not found",
        };
      }

      twitchEventLog.add({
        source: "admin",
        type: "reward_mapping.updated",
        message: `Reward mapping updated: ${mapping.rewardTitle}`,
        data: {
          id: mapping.id,
          rewardId: mapping.rewardId,
          rewardTitle: mapping.rewardTitle,
          unrealEventName: mapping.unrealEventName,
          unityEventName: mapping.unityEventName,
          targetTransports: mapping.targetTransports,
          enabled: mapping.enabled,
        },
      });

      return {
        ok: true,
        data: mapping,
      };
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "Failed to update reward mapping";

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        reply.code(409);
        message = "Reward mapping with this rewardId already exists";
      } else {
        reply.code(400);
      }

      twitchEventLog.add({
        level: "error",
        source: "admin",
        type: "reward_mapping.update_failed",
        message,
        data: {
          id: request.params.id,
          body: request.body as Record<string, unknown>,
        },
      });

      return {
        ok: false,
        message,
      };
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/twitch/rewards/mappings/:id",
    async (request, reply) => {
      try {
        const deleted = await twitchRuntimeContainer.rewardMappingService.delete(
          request.params.id,
        );

        if (!deleted) {
          reply.code(404);

          twitchEventLog.add({
            level: "warn",
            source: "admin",
            type: "reward_mapping.delete_missing",
            message: `Reward mapping not found: ${request.params.id}`,
            data: {
              id: request.params.id,
            },
          });

          return {
            ok: false,
            message: "Reward mapping not found",
          };
        }

        twitchEventLog.add({
          source: "admin",
          type: "reward_mapping.deleted",
          message: `Reward mapping deleted: ${request.params.id}`,
          data: {
            id: request.params.id,
          },
        });

        return {
          ok: true,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete reward mapping";

        twitchEventLog.add({
          level: "error",
          source: "admin",
          type: "reward_mapping.delete_failed",
          message,
          data: {
            id: request.params.id,
          },
        });

        reply.code(400);

        return {
          ok: false,
          message,
        };
      }
    },
  );

  app.get("/twitch/rewards/queue/status", async () => {
    return {
      ok: true,
      data: twitchRuntimeContainer.rewardRedemptionHandler.getQueueStatus(),
    };
  });

  app.get("/twitch/economy/settings", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.economyService.getSettings(true),
    };
  });

  app.patch<{
    Body: UpdateEconomySettingsInput;
  }>("/twitch/economy/settings", async (request, reply) => {
    try {
      const settings = await twitchRuntimeContainer.economyService.updateSettings(
        request.body,
      );

      twitchEventLog.add({
        source: "admin",
        type: "economy.settings_updated",
        message: "Economy settings updated from admin panel",
      });

      return {
        ok: true,
        data: settings,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update economy settings";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get<{
    Querystring: { limit?: string; offset?: string; search?: string };
  }>("/twitch/economy/wallets", async (request) => {
    const limit = parseLimit(request.query.limit, 50);
    const offsetRaw = request.query.offset ? Number(request.query.offset) : 0;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    return {
      ok: true,
      data: await twitchRuntimeContainer.economyService.getWalletsPage({
        limit,
        offset,
        search: request.query.search,
      }),
    };
  });

  app.post("/twitch/economy/wallets/purge-sim", async () => {
    const removed = await twitchRuntimeContainer.economyService.deleteSimWallets();

    twitchEventLog.add({
      source: "admin",
      type: "economy.sim_wallets_purged",
      message: `Purged ${removed} simulator wallet(s) from DB`,
      data: { removed },
    });

    return {
      ok: true,
      data: { removed },
    };
  });

  app.delete<{
    Params: { twitchUserId: string };
  }>("/twitch/economy/wallets/:twitchUserId", async (request, reply) => {
    const deleted = await twitchRuntimeContainer.economyService.deleteWallet(
      request.params.twitchUserId,
    );

    if (!deleted) {
      reply.code(404);

      return {
        ok: false,
        message: "Wallet not found",
      };
    }

    twitchEventLog.add({
      source: "admin",
      type: "economy.wallet_deleted",
      message: `Economy wallet deleted: ${request.params.twitchUserId}`,
      data: { twitchUserId: request.params.twitchUserId },
    });

    return {
      ok: true,
    };
  });

  app.post<{
    Body: {
      twitchUserId?: string;
      userLogin?: string;
      displayName?: string;
      amount?: number;
    };
  }>("/twitch/economy/award", async (request, reply) => {
    const rawUserId = request.body?.twitchUserId?.trim();
    const rawLogin = request.body?.userLogin?.trim()?.replace(/^@/, "");
    const displayNameInput = request.body?.displayName?.trim();
    const amount = request.body?.amount;

    if (!rawLogin && !rawUserId) {
      reply.code(400);

      return {
        ok: false,
        message: "userLogin (or twitchUserId) is required",
      };
    }

    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      reply.code(400);

      return {
        ok: false,
        message: "amount must be a number",
      };
    }

    try {
      // Resolve the recipient to an EXISTING wallet so the award is added to it
      // instead of creating a duplicate under a mismatched id. Order: explicit
      // id → wallet by login → fresh id via Helix.
      let viewer: {
        twitchUserId: string;
        userLogin: string;
        displayName: string;
      } | null = null;

      if (rawUserId) {
        const existing =
          await twitchRuntimeContainer.economyRepository.findWallet(rawUserId);

        viewer = {
          twitchUserId: rawUserId,
          userLogin: existing?.userLogin ?? rawLogin ?? rawUserId,
          displayName:
            displayNameInput ||
            existing?.displayName ||
            rawLogin ||
            rawUserId,
        };
      }

      if (!viewer && rawLogin) {
        const byLogin =
          await twitchRuntimeContainer.economyRepository.findWalletByLogin(
            rawLogin,
          );

        if (byLogin) {
          viewer = {
            twitchUserId: byLogin.twitchUserId,
            userLogin: byLogin.userLogin,
            displayName: displayNameInput || byLogin.displayName || rawLogin,
          };
        } else {
          const resolved =
            await twitchRuntimeContainer.twitchApiClient.getUserByLogin(rawLogin);

          if (!resolved) {
            reply.code(404);
            return {
              ok: false,
              message: `Користувача @${rawLogin} не знайдено на Twitch`,
            };
          }

          viewer = {
            twitchUserId: resolved.id,
            userLogin: resolved.login,
            displayName: displayNameInput || resolved.display_name || resolved.login,
          };
        }
      }

      if (!viewer) {
        reply.code(400);
        return { ok: false, message: "Не вдалося визначити гаманець" };
      }

      const wallet = await twitchRuntimeContainer.economyService.award(
        viewer,
        amount,
        "admin",
      );

      return {
        ok: true,
        data: wallet,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to award economy points";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get("/twitch/buffs/definitions", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.buffService.listDefinitions(),
    };
  });

  app.post<{
    Body: CreateBuffDefinitionInput;
  }>("/twitch/buffs/definitions", async (request, reply) => {
    try {
      const definition = await twitchRuntimeContainer.buffService.createDefinition(
        request.body,
      );

      reply.code(201);

      return {
        ok: true,
        data: definition,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create buff";

      reply.code(
        error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
          ? 409
          : 400,
      );

      return {
        ok: false,
        message,
      };
    }
  });

  app.patch<{
    Params: { key: string };
    Body: UpdateBuffDefinitionInput;
  }>("/twitch/buffs/definitions/:key", async (request, reply) => {
    try {
      const definition = await twitchRuntimeContainer.buffService.updateDefinition(
        request.params.key,
        request.body,
      );

      if (!definition) {
        reply.code(404);

        return {
          ok: false,
          message: "Buff not found",
        };
      }

      return {
        ok: true,
        data: definition,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update buff";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.delete<{
    Params: { key: string };
  }>("/twitch/buffs/definitions/:key", async (request, reply) => {
    const deleted = await twitchRuntimeContainer.buffService.deleteDefinition(
      request.params.key,
    );

    if (!deleted) {
      reply.code(404);

      return {
        ok: false,
        message: "Buff not found",
      };
    }

    return {
      ok: true,
    };
  });

  app.post<{
    Body: SimulateChatInput;
  }>("/twitch/simulate/chat", async (request, reply) => {
    try {
      const result =
        await twitchRuntimeContainer.chatSimulationService.simulateChat(
          request.body,
        );

      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to simulate chat";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get("/twitch/giveaway/settings", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.giveawayService.getSettings(),
    };
  });

  app.patch<{
    Body: UpdateGiveawaySettingsInput;
  }>("/twitch/giveaway/settings", async (request, reply) => {
    try {
      const settings = await twitchRuntimeContainer.giveawayService.updateSettings(
        request.body,
      );

      twitchEventLog.add({
        source: "admin",
        type: "giveaway.settings_updated",
        message: "Giveaway settings updated from admin panel",
      });

      return {
        ok: true,
        data: settings,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update giveaway settings";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get("/twitch/guess/settings", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.guessGameService.getSettings(),
    };
  });

  app.patch<{
    Body: UpdateGuessGameSettingsInput;
  }>("/twitch/guess/settings", async (request, reply) => {
    try {
      const settings = await twitchRuntimeContainer.guessGameService.updateSettings(
        request.body,
      );

      twitchEventLog.add({
        source: "admin",
        type: "guess.settings_updated",
        message: "Guess game settings updated from admin panel",
      });

      return {
        ok: true,
        data: settings,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update guess game settings";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.get("/twitch/help/preview", async () => {
    return {
      ok: true,
      data: {
        commands: await twitchRuntimeContainer.helpCommandRouter.buildCommandList(),
        message: await twitchRuntimeContainer.helpCommandRouter.renderMessage(),
      },
    };
  });

  app.get("/twitch/presence/log", async () => {
    return {
      ok: true,
      data: {
        entries: twitchRuntimeContainer.presenceLogService.list(),
        updatedAt: twitchRuntimeContainer.presenceLogService.lastUpdatedAt,
      },
    };
  });

  // Public command guide (read-only, no auth — see admin-auth.guard allowlist).
  app.get("/public/command-guide", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.commandGuideService.getGuide(),
    };
  });

  // Save edited guide (admin only).
  app.patch<{
    Body: unknown;
  }>("/twitch/command-guide", async (request, reply) => {
    try {
      const guide = await twitchRuntimeContainer.commandGuideService.save(
        request.body,
      );

      twitchEventLog.add({
        source: "admin",
        type: "command_guide.updated",
        message: "Command guide updated from admin panel",
      });

      return {
        ok: true,
        data: guide,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save command guide";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  // Regenerate guide from current settings, replacing manual edits (admin only).
  app.post("/twitch/command-guide/generate", async (_request, reply) => {
    try {
      const guide = await twitchRuntimeContainer.commandGuideService.regenerate();

      twitchEventLog.add({
        source: "admin",
        type: "command_guide.regenerated",
        message: "Command guide regenerated from settings",
      });

      return {
        ok: true,
        data: guide,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to regenerate command guide";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  app.post("/twitch/presence/refresh", async (_request, reply) => {
    try {
      await twitchRuntimeContainer.presenceEarningService.pollNow();

      return {
        ok: true,
        data: {
          entries: twitchRuntimeContainer.presenceLogService.list(),
          updatedAt: twitchRuntimeContainer.presenceLogService.lastUpdatedAt,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to poll chatters";

      reply.code(400);

      return {
        ok: false,
        message,
      };
    }
  });

  // ===== Song request (queue + settings) =====

  app.get("/twitch/song-request/settings", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.getSettings(),
    };
  });

  app.patch<{
    Body: UpdateSongRequestSettingsInput;
  }>("/twitch/song-request/settings", async (request, reply) => {
    try {
      const settings = await twitchRuntimeContainer.songQueueService.updateSettings(
        request.body,
      );

      twitchEventLog.add({
        source: "admin",
        type: "song_request.settings_updated",
        message: "Song request settings updated from admin panel",
      });

      return { ok: true, data: settings };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update song request settings";

      reply.code(400);
      return { ok: false, message };
    }
  });

  app.get("/twitch/song-request/queue", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.getQueueState(),
    };
  });

  // Manual add from the admin panel.
  app.post<{
    Body: { url?: string };
  }>("/twitch/song-request/request", async (request, reply) => {
    try {
      const result = await twitchRuntimeContainer.songQueueService.enqueue({
        url: request.body?.url ?? "",
        requestedBy: "admin",
        requesterId: null,
        source: "site",
      });

      if (!result.ok) {
        reply.code(400);
        return { ok: false, message: result.reason };
      }

      return { ok: true, data: result.entry };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add song";

      reply.code(400);
      return { ok: false, message };
    }
  });

  app.post("/twitch/song-request/skip", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.skipCurrent(),
    };
  });

  app.post("/twitch/song-request/pause", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.togglePause(),
    };
  });

  app.post("/twitch/song-request/clear", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.clear(),
    };
  });

  app.post("/twitch/song-request/previous", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.playPrevious(),
    };
  });

  app.get("/twitch/song-request/history", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.getHistory(30),
    };
  });

  app.delete<{
    Params: { id: string };
  }>("/twitch/song-request/:id", async (request) => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.remove(
        request.params.id,
      ),
    };
  });

  // ===== Supporter perks (tiers + manual supporter allowlist) =====

  app.get("/twitch/supporter/settings", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.supporterService.getSettings(),
    };
  });

  app.patch<{
    Body: UpdateSupporterSettingsInput;
  }>("/twitch/supporter/settings", async (request, reply) => {
    try {
      const settings =
        await twitchRuntimeContainer.supporterService.updateSettings(
          request.body,
        );

      twitchEventLog.add({
        source: "admin",
        type: "supporter.settings_updated",
        message: "Supporter perk settings updated from admin panel",
      });

      return { ok: true, data: settings };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update supporter settings";

      reply.code(400);
      return { ok: false, message };
    }
  });

  app.get("/twitch/supporter/subscribers", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.supporterService.listManualSupporters(),
    };
  });

  app.post<{
    Body: {
      userLogin?: string;
      displayName?: string | null;
      note?: string | null;
      manualUntil?: string | null;
    };
  }>("/twitch/supporter/subscribers", async (request, reply) => {
    try {
      const login = (request.body?.userLogin ?? "").trim();
      if (!login) {
        reply.code(400);
        return { ok: false, message: "userLogin is required" };
      }

      const rawUntil = request.body?.manualUntil;
      let manualUntil: Date | null = null;
      if (rawUntil) {
        const parsed = new Date(rawUntil);
        if (Number.isNaN(parsed.getTime())) {
          reply.code(400);
          return { ok: false, message: "manualUntil is not a valid date" };
        }
        manualUntil = parsed;
      }

      const entry =
        await twitchRuntimeContainer.supporterService.addManualSupporter({
          userLogin: login,
          displayName: request.body?.displayName ?? null,
          note: request.body?.note ?? null,
          manualUntil,
        });

      twitchEventLog.add({
        source: "admin",
        type: "supporter.subscriber_added",
        message: `Manual supporter added: ${entry.userLogin}`,
      });

      return { ok: true, data: entry };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add supporter";

      reply.code(400);
      return { ok: false, message };
    }
  });

  app.delete<{
    Params: { login: string };
  }>("/twitch/supporter/subscribers/:login", async (request) => {
    await twitchRuntimeContainer.supporterService.removeManualSupporter(
      request.params.login,
    );

    twitchEventLog.add({
      source: "admin",
      type: "supporter.subscriber_removed",
      message: `Manual supporter removed: ${request.params.login}`,
    });

    return { ok: true };
  });

  // Resolved perk snapshot for a login (simulator inspect panel).
  app.get<{
    Params: { login: string };
  }>("/twitch/supporter/inspect/:login", async (request) => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.supporterService.inspect(
        request.params.login,
      ),
    };
  });

  // Testing: force a streak (reach `loyal` without waiting real stream-days).
  app.post<{
    Body: { login?: string; streakDays?: number };
  }>("/twitch/supporter/debug/streak", async (request, reply) => {
    const login = (request.body?.login ?? "").trim();
    if (!login) {
      reply.code(400);
      return { ok: false, message: "login is required" };
    }

    await twitchRuntimeContainer.supporterService.debugSetStreak(
      login,
      Number(request.body?.streakDays) || 0,
    );
    return {
      ok: true,
      data: await twitchRuntimeContainer.supporterService.inspect(login),
    };
  });

  // Testing: clear the daily-bonus cooldown so !бонус can be re-run.
  app.post<{
    Body: { login?: string };
  }>("/twitch/supporter/debug/reset-bonus", async (request, reply) => {
    const login = (request.body?.login ?? "").trim();
    if (!login) {
      reply.code(400);
      return { ok: false, message: "login is required" };
    }

    await twitchRuntimeContainer.supporterService.debugResetBonus(login);
    return {
      ok: true,
      data: await twitchRuntimeContainer.supporterService.inspect(login),
    };
  });

  // ===== Public overlay endpoints (no auth — OBS browser source) =====

  app.get("/public/song-queue", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.getQueueState(),
    };
  });

  // Returns the current track, promoting the next one if nothing is playing.
  app.get("/public/song-queue/current", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.ensureCurrent(),
    };
  });

  // Overlay state: current track (promotes next if idle) + pause & skip-vote.
  app.get("/public/song-queue/state", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.getOverlayState(),
    };
  });

  // Current track finished → mark it played and promote the next one.
  app.post("/public/song-queue/advance", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.advance(),
    };
  });

  // Recently played/skipped tracks (public queue page history section).
  app.get("/public/song-queue/history", async () => {
    return {
      ok: true,
      data: await twitchRuntimeContainer.songQueueService.getHistory(20),
    };
  });

  // Public site form: a viewer adds a song by typing a name + YouTube link.
  app.post<{
    Body: { url?: string; name?: string };
  }>("/public/song-queue/request", async (request, reply) => {
    const result = await twitchRuntimeContainer.songQueueService.enqueueFromSite(
      request.body?.url ?? "",
      request.body?.name ?? "",
    );

    if (!result.ok) {
      reply.code(400);
      return {
        ok: false,
        reason: result.reason,
        secondsLeft: result.secondsLeft,
      };
    }

    return { ok: true, data: result.entry, position: result.position };
  });
}



