import { twitchEventLog } from "../events/twitch-event-log.js";
import { twitchRealtimeHub } from "../realtime/twitch-realtime-hub.js";
import { FunMeterRepository } from "./FunMeterRepository.js";
import {
  defaultFunMeterJokes,
  normalizeFunMeterJokes,
  pickFunMeterJoke,
} from "./fun-meter.jokes.js";
import {
  defaultFunMeterMessages,
  normalizeFunMeterMessages,
} from "./fun-meter.messages.js";
import {
  NEUTRAL_ROLL_MODIFIERS,
  PENIS_METER_FEATURE_KEY,
  type CreateFunMeterFeatureInput,
  type FunMeterDirection,
  type FunMeterRollModifiers,
  type FunMeterFeatureDto,
  type FunMeterJokesDto,
  type FunMeterLeaderboardEntry,
  type FunMeterMessagesDto,
  type FunMeterNormalizedRollEvent,
  type FunMeterRollResult,
  type FunMeterRollLimitMode,
  type FunMeterSelfResult,
  type FunMeterViewerInput,
  type UpdateFunMeterFeatureInput,
  type ViewerFunStatDto,
} from "./fun-meter.types.js";
import type {
  FunMeterFeature,
  ViewerFunStat,
} from "../../../generated/prisma/client.js";

const DEFAULT_LEADERBOARD_LIMIT = 5;
const MAX_LIMIT = 100;
const FEATURE_KEY_REGEX = /^[a-z0-9_]{2,64}$/;
const DEFAULT_LEADERBOARD_ARGS = ["top", "leaderboard", "лідери", "топ"];
const DEFAULT_SELF_ARGS = ["me", "my", "я", "мій", "моє"];

type RollSource = "chat.command" | "admin.test";

export class FunMeterService {
  constructor(private readonly repository: FunMeterRepository) {}

  async listFeatures(): Promise<FunMeterFeatureDto[]> {
    const features = await this.repository.listFeatures();
    return features.map((feature) => this.toFeatureDto(feature));
  }

  async getFeature(key: string): Promise<FunMeterFeatureDto | null> {
    const feature = await this.repository.findFeatureByKey(this.normalizeFeatureKey(key));
    return feature ? this.toFeatureDto(feature) : null;
  }

  async createFeature(
    input: CreateFunMeterFeatureInput,
  ): Promise<FunMeterFeatureDto> {
    const normalized = await this.validateFeatureInput(input);
    const feature = await this.repository.createFeature(normalized);

    twitchEventLog.add({
      source: "admin",
      type: "fun_meter.feature_created",
      message: `Fun meter created: ${feature.key}`,
      data: {
        featureKey: feature.key,
        aliases: feature.aliases,
      },
    });

    twitchRealtimeHub.publish("fun-meter.features.changed", await this.listFeatures());

    return this.toFeatureDto(feature);
  }

  async updateFeature(
    key: string,
    input: UpdateFunMeterFeatureInput,
  ): Promise<FunMeterFeatureDto | null> {
    const normalizedKey = this.normalizeFeatureKey(key);
    const existing = await this.repository.findFeatureByKey(normalizedKey);

    if (!existing) {
      return null;
    }

    const merged: CreateFunMeterFeatureInput = {
      key: existing.key,
      title: input.title ?? existing.title,
      unit: input.unit ?? existing.unit,
      enabled: input.enabled ?? existing.enabled,
      aliases: input.aliases ?? existing.aliases,
      leaderboardArgs: input.leaderboardArgs ?? existing.leaderboardArgs,
      selfArgs: input.selfArgs ?? existing.selfArgs,
      rollLimitMode: input.rollLimitMode ?? this.normalizeRollLimitMode(existing.rollLimitMode),
      increaseChance: input.increaseChance ?? existing.increaseChance,
      minRoll: input.minRoll ?? existing.minRoll,
      maxRoll: input.maxRoll ?? existing.maxRoll,
      jokes: input.jokes
        ? normalizeFunMeterJokes(input.jokes)
        : normalizeFunMeterJokes(existing.jokes),
      messages: input.messages
        ? normalizeFunMeterMessages(input.messages)
        : normalizeFunMeterMessages(existing.messages),
    };
    const normalized = await this.validateFeatureInput(merged, normalizedKey);
    const updated = await this.repository.updateFeature(normalizedKey, normalized);

    if (!updated) {
      return null;
    }

    twitchEventLog.add({
      source: "admin",
      type: "fun_meter.feature_updated",
      message: `Fun meter updated: ${updated.key}`,
      data: {
        featureKey: updated.key,
        aliases: updated.aliases,
        enabled: updated.enabled,
      },
    });

    twitchRealtimeHub.publish("fun-meter.features.changed", await this.listFeatures());

    return this.toFeatureDto(updated);
  }

  async findEnabledFeatureByCommandName(
    commandName: string,
  ): Promise<FunMeterFeatureDto | null> {
    const normalizedCommand = this.normalizeCommandToken(commandName);
    const features = await this.repository.listEnabledFeatures();

    for (const feature of features) {
      const aliases = feature.aliases.map((alias) =>
        this.normalizeCommandToken(alias),
      );

      if (aliases.includes(normalizedCommand)) {
        return this.toFeatureDto(feature);
      }
    }

    return null;
  }

  async rollViewer(
    featureKey: string,
    viewer: FunMeterViewerInput,
    options: { source?: RollSource } = {},
  ): Promise<FunMeterRollResult> {
    const feature = await this.requireFeature(featureKey);
    return this.rollFeature(feature, viewer, options);
  }

  async rollFeature(
    feature: FunMeterFeatureDto,
    viewer: FunMeterViewerInput,
    options: { source?: RollSource; modifiers?: FunMeterRollModifiers } = {},
  ): Promise<FunMeterRollResult> {
    const source = options.source ?? "chat.command";

    if (source === "chat.command") {
      const limitStatus = await this.getRollLimitStatus(feature, viewer);

      if (!limitStatus.allowed) {
        throw new Error("Daily fun meter roll limit reached");
      }
    }

    // Активні бафи/дебафи: зсув шансу, множник, плоский бонус, форс напрямку.
    const modifiers = options.modifiers ?? NEUTRAL_ROLL_MODIFIERS;
    const effectiveChance = Math.min(
      0.95,
      Math.max(0.05, feature.increaseChance + modifiers.chanceDelta),
    );
    const baseAmount = this.pickAmount(feature.minRoll, feature.maxRoll);
    const amount = Math.max(
      1,
      Math.floor((baseAmount + modifiers.flatBonus) * modifiers.multiplier),
    );

    let direction = "increase" as FunMeterDirection;
    let delta = 0;
    let newScore = 0;
    let message = "";

    const applied = await this.repository.applyRoll({
      featureKey: feature.key,
      viewer,
      buildUpdate: ({ previousScore, rollsCount }) => {
        // Напрямок вирішуємо всередині транзакції: маємо актуальні score/rollsCount
        // без зайвого читання й без гонки з паралельними ролами.
        const rawDirection =
          modifiers.forcedDirection ??
          (Math.random() < effectiveChance ? "increase" : "decrease");
        const isFirstRoll = rollsCount === 0;
        direction =
          rawDirection === "decrease" && previousScore === 0 && isFirstRoll
            ? "increase"
            : rawDirection;

        const zeroBlocked = direction === "decrease" && previousScore === 0;
        const joke = pickFunMeterJoke(feature.jokes, direction, amount, zeroBlocked);

        if (zeroBlocked) {
          delta = 0;
          newScore = 0;
          message = this.renderTemplate(feature.messages.zeroBlockedMessage, {
            ...this.getFeatureContext(feature),
            ...this.getViewerContext(viewer),
            amount,
            joke,
          });

          return {
            direction,
            delta,
            newScore,
            lastMessage: message,
          };
        }

        delta = direction === "increase" ? amount : -amount;
        newScore =
          direction === "increase"
            ? previousScore + amount
            : Math.max(0, previousScore - amount);
        message = this.renderTemplate(feature.messages.rollMessage, {
          ...this.getFeatureContext(feature),
          ...this.getViewerContext(viewer),
          amount,
          delta,
          deltaWithSign: this.formatSignedNumber(delta),
          previousScore,
          score: newScore,
          newScore,
          joke,
        });

        return {
          direction,
          delta,
          newScore,
          lastMessage: message,
        };
      },
    });

    const stat = this.toDto(applied.stat);
    const displayName = this.getDisplayName(viewer);
    const chatMessage =
      delta === 0 && direction === "decrease"
        ? this.renderTemplate(feature.messages.zeroBlockedChatMessage, {
            ...this.getFeatureContext(feature),
            ...this.getViewerContext(viewer),
            amount,
            score: newScore,
            newScore,
            message,
          })
        : this.renderTemplate(feature.messages.rollChatMessage, {
            ...this.getFeatureContext(feature),
            ...this.getViewerContext(viewer),
            amount,
            delta,
            deltaWithSign: this.formatSignedNumber(delta),
            score: newScore,
            newScore,
            message,
          });

    const normalizedEvent = this.buildNormalizedRollEvent({
      source,
      feature,
      viewer,
      direction,
      amount,
      previousScore: applied.previousScore,
      newScore,
      rank: applied.rank,
      message,
    });

    const result: FunMeterRollResult = {
      featureKey: feature.key,
      feature,
      commandName: this.getPrimaryAlias(feature),
      viewer,
      direction,
      amount,
      delta,
      previousScore: applied.previousScore,
      newScore,
      rank: applied.rank,
      message,
      chatMessage,
      stat,
      normalizedEvent,
    };

    twitchEventLog.add({
      source: source === "chat.command" ? "chat" : "admin",
      type: "fun_meter.roll",
      message: `Fun meter roll: ${viewer.userLogin}`,
      data: {
        twitchUserId: viewer.twitchUserId,
        login: viewer.userLogin,
        displayName: viewer.displayName ?? null,
        score: result.newScore,
        delta: result.delta,
        rank: result.rank,
        featureKey: result.featureKey,
        normalizedEvent,
      },
    });

    twitchRealtimeHub.publish("fun-meter.roll", result);
    twitchRealtimeHub.publish(
      "fun-meter.leaderboard.changed",
      {
        featureKey: feature.key,
        leaderboard: await this.getLeaderboard(feature.key, DEFAULT_LEADERBOARD_LIMIT),
      },
    );

    const zeroBlocked = delta === 0 && direction === "decrease";
    if (source === "chat.command" && !zeroBlocked) {
      await this.markRollUsed(feature, viewer);
    }

    return result;
  }

  /**
   * Daily-limit check, backed by `ViewerFunStat.lastRollDay` so the limit
   * survives a bot restart (it used to live in an in-memory map and reset).
   */
  async getRollLimitStatus(
    feature: FunMeterFeatureDto,
    viewer: FunMeterViewerInput,
  ): Promise<{ allowed: true } | { allowed: false; chatMessage: string }> {
    if (feature.rollLimitMode !== "daily") {
      return { allowed: true };
    }

    const stat = await this.repository.findViewer(
      feature.key,
      viewer.twitchUserId,
    );

    if (stat?.lastRollDay !== this.getLocalDateKey()) {
      return { allowed: true };
    }

    return {
      allowed: false,
      chatMessage: this.renderTemplate(feature.messages.dailyLimitMessage, {
        ...this.getFeatureContext(feature),
        ...this.getViewerContext(viewer),
      }),
    };
  }

  async getLeaderboard(
    featureKey = PENIS_METER_FEATURE_KEY,
    limit = DEFAULT_LEADERBOARD_LIMIT,
  ): Promise<FunMeterLeaderboardEntry[]> {
    const feature = await this.requireFeature(featureKey);
    const normalizedLimit = this.normalizeLimit(limit, DEFAULT_LEADERBOARD_LIMIT);
    const stats = await this.repository.getLeaderboard(feature.key, normalizedLimit);

    return stats.map((stat, index) => ({
      ...this.toDto(stat),
      rank: index + 1,
    }));
  }

  async getLeaderboardForCommand(
    feature: FunMeterFeatureDto,
    viewer: FunMeterViewerInput,
    limit = DEFAULT_LEADERBOARD_LIMIT,
  ): Promise<{ leaderboard: FunMeterLeaderboardEntry[]; chatMessage: string }> {
    const leaderboard = await this.getLeaderboard(feature.key, limit);
    const chatMessage = this.formatLeaderboardMessage(feature, leaderboard);

    twitchEventLog.add({
      source: "chat",
      type: "fun_meter.leaderboard_requested",
      message: `Fun meter leaderboard requested by ${viewer.userLogin}`,
      data: {
        twitchUserId: viewer.twitchUserId,
        login: viewer.userLogin,
        displayName: viewer.displayName ?? null,
        featureKey: feature.key,
      },
    });

    return { leaderboard, chatMessage };
  }

  async getSelfScore(
    feature: FunMeterFeatureDto,
    viewer: FunMeterViewerInput,
  ): Promise<FunMeterSelfResult> {
    const stat = await this.repository.findViewer(feature.key, viewer.twitchUserId);
    const score = stat?.score ?? 0;
    const rank = await this.repository.getRank(feature.key, score);
    const chatMessage = this.renderTemplate(feature.messages.selfScoreMessage, {
      ...this.getFeatureContext(feature),
      ...this.getViewerContext(viewer),
      score,
      rank,
    });

    const result: FunMeterSelfResult = {
      featureKey: feature.key,
      feature,
      viewer,
      score,
      rank,
      stat: stat ? this.toDto(stat) : null,
      chatMessage,
    };

    twitchEventLog.add({
      source: "chat",
      type: "fun_meter.self_requested",
      message: `Fun meter self score requested by ${viewer.userLogin}`,
      data: {
        twitchUserId: viewer.twitchUserId,
        login: viewer.userLogin,
        displayName: viewer.displayName ?? null,
        score,
        rank,
        featureKey: feature.key,
      },
    });

    return result;
  }

  async listViewers(
    featureKey = PENIS_METER_FEATURE_KEY,
    limit = 50,
  ): Promise<FunMeterLeaderboardEntry[]> {
    const feature = await this.requireFeature(featureKey);
    const normalizedLimit = this.normalizeLimit(limit, 50);
    const stats = await this.repository.listViewers(feature.key, normalizedLimit);

    return Promise.all(
      stats.map(async (stat) => ({
        ...this.toDto(stat),
        rank: await this.repository.getRank(feature.key, stat.score),
      })),
    );
  }

  async resetUser(
    featureKey: string,
    twitchUserId: string,
  ): Promise<{ deletedCount: number }> {
    const feature = await this.requireFeature(featureKey);
    const deletedCount = await this.repository.resetUser(
      feature.key,
      twitchUserId,
    );

    // resetUser deletes the stat row, so lastRollDay (the daily limit) goes
    // with it — no separate cleanup needed.

    twitchRealtimeHub.publish("fun-meter.leaderboard.changed", {
      featureKey: feature.key,
      leaderboard: await this.getLeaderboard(feature.key, DEFAULT_LEADERBOARD_LIMIT),
    });

    twitchEventLog.add({
      source: "admin",
      type: "fun_meter.user_reset",
      message: `Fun meter user removed from leaderboard: ${feature.key}`,
      data: {
        twitchUserId,
        featureKey: feature.key,
        deletedCount,
      },
    });

    return { deletedCount };
  }

  async resetAll(featureKey: string): Promise<{ deletedCount: number }> {
    const feature = await this.requireFeature(featureKey);
    const deletedCount = await this.repository.resetAll(feature.key);

    twitchRealtimeHub.publish("fun-meter.leaderboard.changed", {
      featureKey: feature.key,
      leaderboard: [],
    });

    return { deletedCount };
  }

  private async requireFeature(featureKey: string): Promise<FunMeterFeatureDto> {
    const feature = await this.getFeature(featureKey);

    if (!feature) {
      throw new Error(`Fun meter feature not found: ${featureKey}`);
    }

    return feature;
  }

  private async validateFeatureInput(
    input: CreateFunMeterFeatureInput,
    existingKey: string | null = null,
  ): Promise<CreateFunMeterFeatureInput> {
    const key = this.normalizeFeatureKey(input.key);
    const title = this.normalizeText(input.title, "title", 2, 80);
    const unit = this.normalizeText(input.unit ?? "см", "unit", 1, 12);
    const aliases = this.normalizeTokens(input.aliases, "aliases", 1);
    const leaderboardArgs = this.normalizeTokens(
      input.leaderboardArgs ?? DEFAULT_LEADERBOARD_ARGS,
      "leaderboardArgs",
      1,
    );
    const selfArgs = this.normalizeTokens(
      input.selfArgs ?? DEFAULT_SELF_ARGS,
      "selfArgs",
      1,
    );
    const minRoll = this.normalizeRollBound(input.minRoll ?? 1, "minRoll");
    const maxRoll = this.normalizeRollBound(input.maxRoll ?? 20, "maxRoll");
    const rollLimitMode = this.normalizeRollLimitMode(input.rollLimitMode ?? "daily");
    const increaseChance = this.normalizeIncreaseChance(input.increaseChance ?? 0.6);
    const messages = normalizeFunMeterMessages(
      input.messages ?? defaultFunMeterMessages,
    );

    if (minRoll > maxRoll) {
      throw new Error("minRoll must be less than or equal to maxRoll");
    }

    await this.assertAliasesAvailable(aliases, existingKey ?? key);

    return {
      key,
      title,
      unit,
      enabled: input.enabled ?? true,
      aliases,
      leaderboardArgs,
      selfArgs,
      rollLimitMode,
      increaseChance,
      minRoll,
      maxRoll,
      jokes: normalizeFunMeterJokes(input.jokes ?? defaultFunMeterJokes),
      messages,
    };
  }

  private async assertAliasesAvailable(aliases: string[], ownKey: string) {
    const features = await this.repository.listFeatures();
    const requested = new Set(aliases.map((alias) => this.normalizeCommandToken(alias)));

    for (const feature of features) {
      if (feature.key === ownKey) {
        continue;
      }

      for (const alias of feature.aliases) {
        if (requested.has(this.normalizeCommandToken(alias))) {
          throw new Error(`Alias "${alias}" is already used by ${feature.key}`);
        }
      }
    }
  }

  private pickAmount(minRoll: number, maxRoll: number): number {
    return Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
  }

  private buildNormalizedRollEvent(input: {
    source: RollSource;
    feature: FunMeterFeatureDto;
    viewer: FunMeterViewerInput;
    direction: FunMeterDirection;
    amount: number;
    previousScore: number;
    newScore: number;
    rank: number;
    message: string;
  }): FunMeterNormalizedRollEvent {
    return {
      eventKey: `fun.${input.feature.key}.roll`,
      source: input.source,
      commandName: this.getPrimaryAlias(input.feature),
      featureKey: input.feature.key,
      user: {
        id: input.viewer.twitchUserId,
        login: input.viewer.userLogin,
        displayName: input.viewer.displayName ?? null,
      },
      result: {
        direction: input.direction,
        amount: input.amount,
        previousScore: input.previousScore,
        newScore: input.newScore,
        rank: input.rank,
        message: input.message,
      },
    };
  }

  private formatLeaderboardMessage(
    feature: FunMeterFeatureDto,
    leaderboard: FunMeterLeaderboardEntry[],
  ): string {
    if (leaderboard.length === 0) {
      return this.renderTemplate(feature.messages.leaderboardEmpty, {
        ...this.getFeatureContext(feature),
      });
    }

    const lines = leaderboard.map((entry) => {
      const name = entry.displayName || entry.userLogin;
      return this.renderTemplate(feature.messages.leaderboardEntry, {
        ...this.getFeatureContext(feature),
        displayName: name,
        login: entry.userLogin,
        userLogin: entry.userLogin,
        score: entry.score,
        rank: entry.rank,
      });
    });

    return [
      this.renderTemplate(feature.messages.leaderboardTitle, {
        ...this.getFeatureContext(feature),
      }),
      ...lines,
    ].join("\n");
  }

  formatUnknownSubcommandMessage(
    feature: FunMeterFeatureDto,
    viewer: FunMeterViewerInput,
  ): string {
    const alias = this.getPrimaryAlias(feature);

    return this.renderTemplate(feature.messages.unknownSubcommandMessage, {
      ...this.getFeatureContext(feature),
      ...this.getViewerContext(viewer),
      alias,
    });
  }

  private toFeatureDto(feature: FunMeterFeature): FunMeterFeatureDto {
    return {
      id: feature.id,
      key: feature.key,
      title: feature.title,
      unit: feature.unit,
      enabled: feature.enabled,
      aliases: feature.aliases,
      leaderboardArgs: feature.leaderboardArgs,
      selfArgs: feature.selfArgs,
      rollLimitMode: this.normalizeRollLimitMode(feature.rollLimitMode),
      increaseChance: feature.increaseChance,
      minRoll: feature.minRoll,
      maxRoll: feature.maxRoll,
      jokes: normalizeFunMeterJokes(feature.jokes) as FunMeterJokesDto,
      messages: normalizeFunMeterMessages(feature.messages) as FunMeterMessagesDto,
      createdAt: feature.createdAt.toISOString(),
      updatedAt: feature.updatedAt.toISOString(),
    };
  }

  private toDto(stat: ViewerFunStat): ViewerFunStatDto {
    return {
      id: stat.id,
      featureKey: stat.featureKey,
      twitchUserId: stat.twitchUserId,
      userLogin: stat.userLogin,
      displayName: stat.displayName,
      score: stat.score,
      rollsCount: stat.rollsCount,
      lastDelta: stat.lastDelta,
      lastDirection: stat.lastDirection,
      lastMessage: stat.lastMessage,
      createdAt: stat.createdAt.toISOString(),
      updatedAt: stat.updatedAt.toISOString(),
    };
  }

  private getDisplayName(viewer: FunMeterViewerInput): string {
    return viewer.displayName?.trim() || viewer.userLogin;
  }

  private getFeatureContext(feature: FunMeterFeatureDto): Record<string, unknown> {
    return {
      featureKey: feature.key,
      key: feature.key,
      title: feature.title,
      unit: feature.unit,
      alias: this.getPrimaryAlias(feature),
    };
  }

  private getViewerContext(viewer: FunMeterViewerInput): Record<string, unknown> {
    return {
      twitchUserId: viewer.twitchUserId,
      login: viewer.userLogin,
      userLogin: viewer.userLogin,
      displayName: this.getDisplayName(viewer),
    };
  }

  private renderTemplate(
    template: string,
    values: Record<string, unknown>,
  ): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];

      if (value === undefined || value === null) {
        return match;
      }

      return String(value);
    });
  }

  private formatSignedNumber(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  private getPrimaryAlias(feature: FunMeterFeatureDto): string {
    return feature.aliases[0] ?? feature.key;
  }

  private normalizeLimit(limit: number, fallback: number): number {
    return Number.isFinite(limit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
      : fallback;
  }

  private normalizeFeatureKey(value: string): string {
    const key = value.trim().toLocaleLowerCase();

    if (!FEATURE_KEY_REGEX.test(key)) {
      throw new Error("Feature key must be 2-64 chars: lowercase latin, numbers, underscores");
    }

    return key;
  }

  private normalizeTokens(
    values: string[],
    fieldName: string,
    minCount: number,
  ): string[] {
    if (!Array.isArray(values)) {
      throw new Error(`${fieldName} must be an array`);
    }

    const normalized = [
      ...new Set(values.map((value) => this.normalizeCommandToken(value))),
    ].filter(Boolean);

    if (normalized.length < minCount) {
      throw new Error(`${fieldName} must contain at least ${minCount} item`);
    }

    return normalized;
  }

  private normalizeCommandToken(value: string): string {
    const normalized = value.trim().replace(/^!+/, "").toLocaleLowerCase();

    if (!normalized || /\s/.test(normalized)) {
      throw new Error("Command tokens cannot be empty or contain spaces");
    }

    return normalized;
  }

  private normalizeText(
    value: string,
    fieldName: string,
    minLength: number,
    maxLength: number,
  ): string {
    const normalized = value.trim();

    if (normalized.length < minLength || normalized.length > maxLength) {
      throw new Error(`${fieldName} must be ${minLength}-${maxLength} chars`);
    }

    return normalized;
  }

  private normalizeRollBound(value: number, fieldName: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a number`);
    }

    const normalized = Math.floor(value);

    if (normalized < 1 || normalized > 1000) {
      throw new Error(`${fieldName} must be between 1 and 1000`);
    }

    return normalized;
  }

  private normalizeIncreaseChance(value: number): number {
    if (!Number.isFinite(value)) {
      throw new Error("increaseChance must be a number");
    }

    const clamped = Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
    return clamped;
  }

  private normalizeRollLimitMode(value: string): FunMeterRollLimitMode {
    if (value === "none" || value === "daily") {
      return value;
    }

    throw new Error('rollLimitMode must be either "daily" or "none"');
  }

  private async markRollUsed(
    feature: FunMeterFeatureDto,
    viewer: FunMeterViewerInput,
  ): Promise<void> {
    if (feature.rollLimitMode !== "daily") {
      return;
    }

    await this.repository.setLastRollDay(
      feature.key,
      viewer.twitchUserId,
      this.getLocalDateKey(),
    );
  }

  private getLocalDateKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }
}
