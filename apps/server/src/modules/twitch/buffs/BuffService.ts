import { twitchEventLog } from "../events/twitch-event-log.js";
import { EconomyService } from "../economy/EconomyService.js";
import {
  NEUTRAL_ROLL_MODIFIERS,
  type FunMeterDirection,
  type FunMeterRollModifiers,
} from "../fun-meter/fun-meter.types.js";
import { BuffRepository } from "./BuffRepository.js";
import {
  BUFF_EFFECT_TYPES,
  BUFF_KINDS,
  normalizeBuffMessages,
  normalizeCurseCommand,
  type ActiveBuffDto,
  type BuffDefinitionDto,
  type BuffDurationMode,
  type BuffEffectType,
  type BuffKind,
  type BuffSettingsDto,
  type BuffTarget,
  type BuffViewerInput,
  type CreateBuffDefinitionInput,
  type UpdateBuffDefinitionInput,
  type UpdateBuffSettingsInput,
} from "./buff.types.js";
import type {
  ActiveBuff,
  BuffDefinition,
} from "../../../generated/prisma/client.js";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;
const SETTINGS_TTL_MS = 30_000;

export class BuffService {
  private settingsCache: { value: BuffSettingsDto; at: number } | null = null;

  constructor(
    private readonly repository: BuffRepository,
    private readonly economyService: EconomyService,
  ) {}

  async getSettings(): Promise<BuffSettingsDto> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.value;
    }

    const row = await this.repository.getSettingsRow();
    const value: BuffSettingsDto = {
      curseCommand: row.curseCommand,
      curseCooldownSec: row.curseCooldownSec,
      curseCost: row.curseCost,
      messages: normalizeBuffMessages(row.messages),
      updatedAt: row.updatedAt.toISOString(),
    };

    this.settingsCache = { value, at: now };
    return value;
  }

  async updateSettings(
    input: UpdateBuffSettingsInput,
  ): Promise<BuffSettingsDto> {
    const normalized: UpdateBuffSettingsInput = {
      ...input,
      ...(input.curseCommand !== undefined
        ? { curseCommand: normalizeCurseCommand(input.curseCommand) }
        : {}),
      ...(input.curseCooldownSec !== undefined
        ? { curseCooldownSec: Math.max(0, Math.round(input.curseCooldownSec)) }
        : {}),
      ...(input.curseCost !== undefined
        ? { curseCost: Math.max(0, Math.round(input.curseCost)) }
        : {}),
    };

    await this.repository.updateSettings(normalized);
    this.settingsCache = null;
    return this.getSettings();
  }

  /**
   * Applies a random enabled DEBUFF to a target (the "curse" command). No cost
   * or chance flip here — the caller handles charging and cooldown. Returns null
   * if there are no enabled debuffs to draw from.
   */
  async hasEnabledDebuffs(): Promise<boolean> {
    const enabled = await this.repository.listEnabledDefinitions();
    return enabled.some((def) => def.kind === "debuff");
  }

  async applyRandomDebuff(
    target: BuffViewerInput,
    source = "curse",
  ): Promise<{ definition: BuffDefinitionDto; buff: ActiveBuffDto } | null> {
    const enabled = await this.repository.listEnabledDefinitions();
    const debuffs = enabled.filter((def) => def.kind === "debuff");

    if (debuffs.length === 0) {
      return null;
    }

    const definition = debuffs[Math.floor(Math.random() * debuffs.length)]!;
    const now = Date.now();
    const expiresAt =
      definition.durationMode === "time"
        ? new Date(now + definition.durationValue * 60_000)
        : null;
    const rollsRemaining =
      definition.durationMode === "rolls" ? definition.durationValue : null;

    const active = await this.repository.createActiveBuff({
      twitchUserId: target.twitchUserId,
      userLogin: target.userLogin,
      buffKey: definition.key,
      title: definition.title,
      kind: definition.kind,
      effectType: definition.effectType,
      magnitude: definition.magnitude,
      durationMode: definition.durationMode,
      expiresAt,
      rollsRemaining,
      source,
    });

    return {
      definition: this.toDefinitionDto(definition),
      buff: this.toActiveDto(active),
    };
  }

  async listDefinitions(): Promise<BuffDefinitionDto[]> {
    const definitions = await this.repository.listDefinitions();
    return definitions.map((definition) => this.toDefinitionDto(definition));
  }

  async createDefinition(
    input: CreateBuffDefinitionInput,
  ): Promise<BuffDefinitionDto> {
    const normalized = this.validateDefinitionInput(input);
    const definition = await this.repository.createDefinition(normalized);
    return this.toDefinitionDto(definition);
  }

  async updateDefinition(
    key: string,
    input: UpdateBuffDefinitionInput,
  ): Promise<BuffDefinitionDto | null> {
    const normalizedKey = this.normalizeKey(key);
    const existing = await this.repository.findDefinition(normalizedKey);

    if (!existing) {
      return null;
    }

    const merged: CreateBuffDefinitionInput = {
      key: existing.key,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      kind: (input.kind ?? existing.kind) as BuffKind,
      effectType: (input.effectType ?? existing.effectType) as BuffEffectType,
      magnitude: input.magnitude ?? existing.magnitude,
      durationMode: (input.durationMode ??
        existing.durationMode) as BuffDurationMode,
      durationValue: input.durationValue ?? existing.durationValue,
      cost: input.cost ?? existing.cost,
      target: (input.target ?? existing.target) as BuffTarget,
      enabled: input.enabled ?? existing.enabled,
    };

    const normalized = this.validateDefinitionInput(merged);
    const updated = await this.repository.updateDefinition(
      normalizedKey,
      normalized,
    );

    return updated ? this.toDefinitionDto(updated) : null;
  }

  async deleteDefinition(key: string): Promise<boolean> {
    return this.repository.deleteDefinition(this.normalizeKey(key));
  }

  async getDefinition(key: string): Promise<BuffDefinitionDto | null> {
    let normalizedKey: string;

    try {
      normalizedKey = this.normalizeKey(key);
    } catch {
      return null;
    }

    const definition = await this.repository.findDefinition(normalizedKey);
    return definition ? this.toDefinitionDto(definition) : null;
  }

  /**
   * Random buff/debuff "roulette": spends a fixed cost, flips buff-vs-debuff by
   * chancePercent, then picks a random enabled definition of that kind. Falls
   * back to the other kind if the chosen pool is empty so a paid roll always
   * yields something. The virtual "люркер" debuff is never a BuffDefinition row,
   * so it is naturally excluded from the pool.
   */
  async rollBuff(
    viewer: BuffViewerInput,
    options: { cost: number; chancePercent: number },
    source = "roll",
  ): Promise<{ buff: ActiveBuffDto; definition: BuffDefinitionDto; balance: number }> {
    const enabled = await this.repository.listEnabledDefinitions();

    if (enabled.length === 0) {
      throw new Error("NO_BUFFS_AVAILABLE");
    }

    const wantBuff = Math.random() * 100 < options.chancePercent;
    const primaryKind: BuffKind = wantBuff ? "buff" : "debuff";

    const primaryPool = enabled.filter((def) => def.kind === primaryKind);
    const pool = primaryPool.length > 0 ? primaryPool : enabled;
    const definition = pool[Math.floor(Math.random() * pool.length)]!;

    let balance = await this.economyService.getBalance(viewer.twitchUserId);

    if (options.cost > 0) {
      const wallet = await this.economyService.spend(
        viewer.twitchUserId,
        options.cost,
      );
      balance = wallet.balance;
    }

    const now = Date.now();
    const expiresAt =
      definition.durationMode === "time"
        ? new Date(now + definition.durationValue * 60_000)
        : null;
    const rollsRemaining =
      definition.durationMode === "rolls" ? definition.durationValue : null;

    const active = await this.repository.createActiveBuff({
      twitchUserId: viewer.twitchUserId,
      userLogin: viewer.userLogin,
      buffKey: definition.key,
      title: definition.title,
      kind: definition.kind,
      effectType: definition.effectType,
      magnitude: definition.magnitude,
      durationMode: definition.durationMode,
      expiresAt,
      rollsRemaining,
      source,
    });

    twitchEventLog.add({
      source: "chat",
      type: "buff.rolled",
      message: `Buff rolled: ${viewer.userLogin} -> ${definition.key} (${definition.kind})`,
      data: {
        twitchUserId: viewer.twitchUserId,
        login: viewer.userLogin,
        buffKey: definition.key,
        kind: definition.kind,
        cost: options.cost,
        balance,
      },
    });

    return {
      buff: this.toActiveDto(active),
      definition: this.toDefinitionDto(definition),
      balance,
    };
  }

  async getActiveBuffs(twitchUserId: string): Promise<ActiveBuffDto[]> {
    const rows = await this.loadActive(twitchUserId);
    return rows.map((row) => this.toActiveDto(row));
  }

  /**
   * Grants a one-off time-based ActiveBuff with an explicit effect/magnitude —
   * used by the chat simulator to test how a specific buff/debuff affects
   * rolls/roulette without rolling for a random one.
   */
  async grantActiveBuff(
    viewer: BuffViewerInput,
    effectType: BuffEffectType,
    magnitude: number,
    durationMinutes = 60,
  ): Promise<ActiveBuffDto> {
    const normalizedEffect = this.normalizeEffectType(effectType);
    const normalizedMagnitude = this.normalizeMagnitude(magnitude);

    const active = await this.repository.createActiveBuff({
      twitchUserId: viewer.twitchUserId,
      userLogin: viewer.userLogin,
      buffKey: "sim",
      title: "Тестовий ефект",
      kind: this.deriveKind(normalizedEffect, normalizedMagnitude),
      effectType: normalizedEffect,
      magnitude: normalizedMagnitude,
      durationMode: "time",
      expiresAt: new Date(Date.now() + durationMinutes * 60_000),
      rollsRemaining: null,
      source: "sim",
    });

    return this.toActiveDto(active);
  }

  /** Direction of an effect when no explicit kind is set (sim-injected buffs). */
  private deriveKind(effectType: BuffEffectType, magnitude: number): BuffKind {
    if (effectType === "no_earn") {
      return "debuff";
    }

    if (effectType === "multiplier") {
      return magnitude >= 100 ? "buff" : "debuff";
    }

    return magnitude >= 0 ? "buff" : "debuff";
  }

  async resolveRollModifiers(
    twitchUserId: string,
  ): Promise<FunMeterRollModifiers> {
    const active = await this.loadActive(twitchUserId);

    if (active.length === 0) {
      return NEUTRAL_ROLL_MODIFIERS;
    }

    let chanceDelta = 0;
    let multiplier = 1;
    let flatBonus = 0;
    let forcedDirection: FunMeterDirection | null = null;

    for (const buff of active) {
      switch (buff.effectType) {
        case "chance":
          chanceDelta += buff.magnitude / 100;
          break;
        case "multiplier":
          multiplier *= buff.magnitude / 100;
          break;
        case "flat":
          flatBonus += buff.magnitude;
          break;
        case "guarantee":
          forcedDirection = buff.magnitude >= 0 ? "increase" : "decrease";
          break;
        default:
          break;
      }
    }

    return { chanceDelta, multiplier, flatBonus, forcedDirection };
  }

  /**
   * Combined multiplier from active `multiplier`-type buffs/debuffs, applied to
   * passive earning (chat activity + presence). Only multiplier effects apply to
   * earning — chance/guarantee/flat are roll-only. Returns 1 when no buffs.
   */
  async resolveEarningMultiplier(twitchUserId: string): Promise<number> {
    const active = await this.loadActive(twitchUserId);
    return this.multiplierFromBuffs(active);
  }

  /**
   * Bulk variant for the presence tick: resolves the earning multiplier for many
   * viewers using two queries total (prune expired + list) instead of per-user.
   * Users with no active buffs are absent from the map (caller defaults to 1).
   */
  async resolveEarningMultipliers(
    twitchUserIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (twitchUserIds.length === 0) {
      return result;
    }

    const now = new Date();
    await this.repository.deleteExpiredForUsers(twitchUserIds, now);
    const rows = await this.repository.listActiveBuffsForUsers(twitchUserIds);

    const byUser = new Map<string, ActiveBuff[]>();

    for (const row of rows) {
      if (
        row.durationMode === "time" &&
        row.expiresAt !== null &&
        row.expiresAt < now
      ) {
        continue;
      }

      const list = byUser.get(row.twitchUserId);

      if (list) {
        list.push(row);
      } else {
        byUser.set(row.twitchUserId, [row]);
      }
    }

    for (const [userId, buffs] of byUser) {
      result.set(userId, this.multiplierFromBuffs(buffs));
    }

    return result;
  }

  private multiplierFromBuffs(buffs: ActiveBuff[]): number {
    let multiplier = 1;

    for (const buff of buffs) {
      // A single "no_earn" debuff zeroes all passive earning outright.
      if (buff.effectType === "no_earn") {
        return 0;
      }

      if (buff.effectType === "multiplier") {
        multiplier *= buff.magnitude / 100;
      }
    }

    return multiplier;
  }

  async consumeRollBuffs(twitchUserId: string): Promise<void> {
    const active = await this.repository.listActiveBuffs(twitchUserId);

    for (const buff of active) {
      if (buff.durationMode !== "rolls" || buff.rollsRemaining === null) {
        continue;
      }

      const remaining = buff.rollsRemaining - 1;

      if (remaining <= 0) {
        await this.repository.deleteActiveBuff(buff.id);
      } else {
        await this.repository.setRollsRemaining(buff.id, remaining);
      }
    }
  }

  private async loadActive(twitchUserId: string): Promise<ActiveBuff[]> {
    const now = new Date();
    await this.repository.deleteExpiredForUser(twitchUserId, now);
    const rows = await this.repository.listActiveBuffs(twitchUserId);

    return rows.filter(
      (row) =>
        !(
          row.durationMode === "time" &&
          row.expiresAt !== null &&
          row.expiresAt < now
        ),
    );
  }

  private validateDefinitionInput(
    input: CreateBuffDefinitionInput,
  ): Required<CreateBuffDefinitionInput> {
    const key = this.normalizeKey(input.key);
    const title = this.normalizeText(input.title, "title", 2, 80);
    const description = (input.description ?? "").trim().slice(0, 200);
    const kind = this.normalizeKind(input.kind ?? "buff");
    const effectType = this.normalizeEffectType(input.effectType ?? "chance");
    const durationMode = this.normalizeDurationMode(
      input.durationMode ?? "time",
    );
    const target = this.normalizeTarget(input.target ?? "self");
    const magnitude = this.normalizeMagnitude(input.magnitude ?? 0);
    const durationValue = this.normalizeInt(
      input.durationValue ?? 10,
      "durationValue",
      1,
      100_000,
    );
    const cost = this.normalizeInt(input.cost ?? 100, "cost", 0, 1_000_000_000);

    return {
      key,
      title,
      description,
      kind,
      effectType,
      magnitude,
      durationMode,
      durationValue,
      cost,
      target,
      enabled: input.enabled ?? true,
    };
  }

  private toDefinitionDto(definition: BuffDefinition): BuffDefinitionDto {
    return {
      id: definition.id,
      key: definition.key,
      title: definition.title,
      description: definition.description,
      kind: definition.kind as BuffKind,
      effectType: definition.effectType as BuffEffectType,
      magnitude: definition.magnitude,
      durationMode: definition.durationMode as BuffDurationMode,
      durationValue: definition.durationValue,
      cost: definition.cost,
      target: definition.target as BuffTarget,
      enabled: definition.enabled,
      createdAt: definition.createdAt.toISOString(),
      updatedAt: definition.updatedAt.toISOString(),
    };
  }

  private toActiveDto(active: ActiveBuff): ActiveBuffDto {
    return {
      id: active.id,
      twitchUserId: active.twitchUserId,
      userLogin: active.userLogin,
      buffKey: active.buffKey,
      title: active.title,
      kind: active.kind as BuffKind,
      effectType: active.effectType as BuffEffectType,
      magnitude: active.magnitude,
      durationMode: active.durationMode as BuffDurationMode,
      expiresAt: active.expiresAt ? active.expiresAt.toISOString() : null,
      rollsRemaining: active.rollsRemaining,
      source: active.source,
      createdAt: active.createdAt.toISOString(),
    };
  }

  private normalizeKey(value: string): string {
    const key = value.trim().toLocaleLowerCase();

    if (!KEY_REGEX.test(key)) {
      throw new Error(
        "Buff key must be 2-64 chars: lowercase latin, numbers, underscores",
      );
    }

    return key;
  }

  private normalizeKind(value: string): BuffKind {
    if ((BUFF_KINDS as string[]).includes(value)) {
      return value as BuffKind;
    }

    throw new Error(`kind must be one of: ${BUFF_KINDS.join(", ")}`);
  }

  private normalizeEffectType(value: string): BuffEffectType {
    if ((BUFF_EFFECT_TYPES as string[]).includes(value)) {
      return value as BuffEffectType;
    }

    throw new Error(
      `effectType must be one of: ${BUFF_EFFECT_TYPES.join(", ")}`,
    );
  }

  private normalizeDurationMode(value: string): BuffDurationMode {
    if (value === "time" || value === "rolls") {
      return value;
    }

    throw new Error('durationMode must be "time" or "rolls"');
  }

  private normalizeTarget(value: string): BuffTarget {
    if (value === "self" || value === "other") {
      return value;
    }

    throw new Error('target must be "self" or "other"');
  }

  private normalizeMagnitude(value: number): number {
    if (!Number.isFinite(value)) {
      throw new Error("magnitude must be a number");
    }

    return Math.round(Math.min(100_000, Math.max(-100_000, value)) * 100) / 100;
  }

  private normalizeInt(
    value: number,
    fieldName: string,
    min: number,
    max: number,
  ): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a number`);
    }

    const normalized = Math.floor(value);

    if (normalized < min || normalized > max) {
      throw new Error(`${fieldName} must be between ${min} and ${max}`);
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
}
