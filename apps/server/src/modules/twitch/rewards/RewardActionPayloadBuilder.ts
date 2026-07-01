import type { RewardMappingDto } from "./reward-mapping.types.js";
import type { RewardActionPayload } from "./reward-dispatch.types.js";
import type { TwitchRewardRedemptionEvent } from "../twitch.types.js";

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function substituteString(
  input: string,
  variables: Record<string, string>,
): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, token) => {
    return token in variables ? variables[token] ?? "" : match;
  });
}

function resolveTemplateValue(
  value: unknown,
  variables: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    return substituteString(value, variables);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateValue(entry, variables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveTemplateValue(entry, variables),
      ]),
    );
  }

  return value;
}

export class RewardActionPayloadBuilder {
  build(
    mapping: RewardMappingDto,
    event: TwitchRewardRedemptionEvent,
  ): RewardActionPayload {
    const templatePayload = deepClone(mapping.payloadTemplate ?? null);

    const variables: Record<string, string> = {
      redemptionId: event.id,
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      rewardCost: String(event.reward.cost),
      userId: event.user_id,
      userLogin: event.user_login,
      userName: event.user_name,
      userInput: event.user_input ?? "",
      redeemedAt: event.redeemed_at,
      unrealEventName: mapping.unrealEventName ?? "",
      unityEventName: mapping.unityEventName ?? mapping.unrealEventName ?? "",
      mappingId: mapping.id,
    };

    const resolvedTemplate = resolveTemplateValue(templatePayload, variables);
    const resolvedPayload =
      resolvedTemplate && typeof resolvedTemplate === "object" && !Array.isArray(resolvedTemplate)
        ? { ...(resolvedTemplate as Record<string, unknown>) }
        : {};

    return {
      eventName: mapping.unrealEventName,
      redemptionId: event.id,
      rewardId: event.reward.id,
      rewardTitle: event.reward.title,
      rewardCost: event.reward.cost,
      userId: event.user_id,
      userLogin: event.user_login,
      userName: event.user_name,
      userInput: event.user_input || null,
      redeemedAt: event.redeemed_at,
      mappingId: mapping.id,
      templatePayload,
      resolvedPayload: {
        ...resolvedPayload,
        eventName: mapping.unrealEventName,
        reward: {
          id: event.reward.id,
          title: event.reward.title,
          cost: event.reward.cost,
          prompt: event.reward.prompt,
        },
        redemption: {
          id: event.id,
          redeemedAt: event.redeemed_at,
          status: event.status,
          userInput: event.user_input || null,
        },
        user: {
          id: event.user_id,
          login: event.user_login,
          name: event.user_name,
        },
        mapping: {
          id: mapping.id,
          unrealEventName: mapping.unrealEventName,
          unityEventName: mapping.unityEventName,
          targetTransports: mapping.targetTransports,
          enabled: mapping.enabled,
        },
      },
    };
  }
}

