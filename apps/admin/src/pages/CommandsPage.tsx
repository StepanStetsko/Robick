import { useEffect, useMemo, useState, type FormEvent } from "react";
import { HelpCommandCard } from "../components/HelpCommandCard";
import {
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommands,
  updateCustomCommand,
} from "../api/commands";
import { getUnityCapabilities } from "../api/engine";
import { subscribeToTwitchRealtime } from "../api/realtime";
import type {
  CreateCustomCommandDto,
  CustomCommand,
  CustomCommandTargetTransport,
  ReplyMode,
} from "../types/commands";
import type {
  UnityCapabilities,
  UnityCapabilityAction,
  UnityCapabilityField,
} from "../types/engine";

type FormState = CreateCustomCommandDto & {
  payloadTemplateText: string;
};

const initialForm: FormState = {
  name: "",
  responseText: "",
  enabled: true,
  cooldownMs: 5000,
  replyMode: "reply",
  actionEnabled: false,
  targetTransports: [],
  unrealEventName: "",
  unityEventName: "",
  payloadTemplate: null,
  payloadTemplateText: "",
};

function formatPayloadTemplate(value: unknown | null | undefined): string {
  if (value == null) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parsePayloadTemplate(value: string): unknown | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return JSON.parse(trimmed);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeTargets(
  targets: CustomCommandTargetTransport[] | null | undefined,
): CustomCommandTargetTransport[] {
  const normalized = new Set<CustomCommandTargetTransport>();

  for (const target of targets ?? []) {
    if (target === "unreal" || target === "unity") {
      normalized.add(target);
    }
  }

  return [...normalized];
}

function hasTarget(
  targets: CustomCommandTargetTransport[] | undefined,
  target: CustomCommandTargetTransport,
) {
  return normalizeTargets(targets).includes(target);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayloadTemplateObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = parsePayloadTemplate(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getDefaultFieldValue(
  action: UnityCapabilityAction,
  field: UnityCapabilityField,
): unknown {
  if (action.eventName === "show_message" && field.name === "message") {
    return "{{userName}} used !{{commandName}} {{argsText}}";
  }

  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }

  if (field.kind === "target") {
    return action.targets?.[0]?.id ?? "";
  }

  if (field.kind === "boolean") {
    return false;
  }

  if (field.kind === "number") {
    return 0;
  }

  return "";
}

function buildDefaultPayloadForAction(action: UnityCapabilityAction): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of action.fields) {
    payload[field.name] = getDefaultFieldValue(action, field);
  }

  return payload;
}

function findUnityAction(
  capabilities: UnityCapabilities | null,
  eventName: string | null | undefined,
): UnityCapabilityAction | null {
  return capabilities?.actions.find((action) => action.eventName === eventName) ?? null;
}

function getDefaultUnityAction(
  capabilities: UnityCapabilities | null,
): UnityCapabilityAction | null {
  return (
    capabilities?.actions.find((action) => action.eventName === "show_message") ??
    capabilities?.actions[0] ??
    null
  );
}

function validateForm(form: FormState): string | null {
  if (form.actionEnabled) {
    const targets = normalizeTargets(form.targetTransports);

    if (targets.length === 0) {
      return "Оберіть хоча б один engine target";
    }

    if (targets.includes("unity") && !normalizeText(form.unityEventName)) {
      return "Unity Event Name обов'язковий";
    }

    if (targets.includes("unreal") && !normalizeText(form.unrealEventName)) {
      return "Unreal Event Name обов'язковий";
    }
  }

  try {
    parsePayloadTemplate(form.payloadTemplateText);
  } catch {
    return "Payload Template має бути валідним JSON";
  }

  return null;
}

function toDto(form: FormState): CreateCustomCommandDto {
  return {
    name: normalizeText(form.name),
    responseText: form.responseText,
    enabled: form.enabled,
    cooldownMs: form.cooldownMs,
    replyMode: form.replyMode,
    actionEnabled: form.actionEnabled ?? false,
    targetTransports: normalizeTargets(form.targetTransports),
    unrealEventName: normalizeText(form.unrealEventName) || null,
    unityEventName: normalizeText(form.unityEventName) || null,
    payloadTemplate: parsePayloadTemplate(form.payloadTemplateText),
  };
}

export function CommandsPage() {
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [unityCapabilities, setUnityCapabilities] = useState<UnityCapabilities | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);

  const unityActions = useMemo(
    () => unityCapabilities?.actions ?? [],
    [unityCapabilities],
  );

  const selectedUnityAction = useMemo(
    () => findUnityAction(unityCapabilities, form.unityEventName),
    [form.unityEventName, unityCapabilities],
  );

  const selectedUnityPayload = useMemo(
    () => parsePayloadTemplateObject(form.payloadTemplateText),
    [form.payloadTemplateText],
  );

  const unityTargetCount = useMemo(
    () => unityActions.reduce((total, action) => total + (action.targets?.length ?? 0), 0),
    [unityActions],
  );

  async function loadUnityCapabilities() {
    setCapabilitiesLoading(true);

    try {
      setUnityCapabilities(await getUnityCapabilities());
    } catch {
      setUnityCapabilities(null);
    } finally {
      setCapabilitiesLoading(false);
    }
  }

  async function loadCommands() {
    setLoading(true);
    setError(null);

    try {
      const commandsResult = await getCustomCommands();
      setCommands(Array.isArray(commandsResult) ? commandsResult : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося завантажити команди",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCommands();
    void loadUnityCapabilities();

    const unsubscribe = subscribeToTwitchRealtime({
      onSnapshot: (snapshot) => {
        setCommands(Array.isArray(snapshot.commands) ? snapshot.commands : []);
        if (snapshot.engineCapabilities) {
          setUnityCapabilities(snapshot.engineCapabilities.unity);
        }
        setLoading(false);
      },
      onCommandsChanged: (items) => {
        setCommands(Array.isArray(items) ? items : []);
      },
      onEngineCapabilities: (data) => {
        setUnityCapabilities(data.unity);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const sortedCommands = useMemo(() => {
    return [...commands].sort((a, b) => a.name.localeCompare(b.name));
  }, [commands]);

  function resetForm() {
    setForm(initialForm);
    setEditingName(null);
    setSubmitError(null);
    setFormOpen(false);
  }

  function startEdit(command: CustomCommand) {
    setEditingName(command.name);
    setFormOpen(true);
    setForm({
      name: command.name,
      responseText: command.responseText,
      enabled: command.enabled,
      cooldownMs: command.cooldownMs,
      replyMode: command.replyMode,
      actionEnabled: command.actionEnabled ?? false,
      targetTransports: normalizeTargets(command.targetTransports),
      unrealEventName: command.unrealEventName ?? "",
      unityEventName: command.unityEventName ?? "",
      payloadTemplate: command.payloadTemplate ?? null,
      payloadTemplateText: formatPayloadTemplate(command.payloadTemplate),
    });
    setSubmitError(null);
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTargetTransport(
    target: CustomCommandTargetTransport,
    enabled: boolean,
  ) {
    setForm((current) => {
      const targets = new Set(normalizeTargets(current.targetTransports));
      const next = {
        ...current,
        targetTransports: [...targets],
      };

      if (enabled) {
        targets.add(target);
      } else {
        targets.delete(target);
      }

      next.targetTransports = [...targets];

      if (target === "unity" && enabled && !normalizeText(next.unityEventName)) {
        const defaultAction = getDefaultUnityAction(unityCapabilities);
        next.unityEventName = defaultAction?.eventName ?? "";

        if (defaultAction && !next.payloadTemplateText.trim()) {
          next.payloadTemplateText = formatPayloadTemplate(buildDefaultPayloadForAction(defaultAction));
        }
      }

      return next;
    });
  }

  function handleUnityActionChange(eventName: string) {
    const action = findUnityAction(unityCapabilities, eventName);

    setForm((current) => ({
      ...current,
      unityEventName: eventName,
      payloadTemplateText: action
        ? formatPayloadTemplate(buildDefaultPayloadForAction(action))
        : current.payloadTemplateText,
    }));
  }

  function updatePayloadField(field: UnityCapabilityField, value: unknown) {
    setForm((current) => {
      const payload = parsePayloadTemplateObject(current.payloadTemplateText);
      payload[field.name] = value;

      return {
        ...current,
        payloadTemplateText: formatPayloadTemplate(payload),
      };
    });
  }

  function renderCapabilityField(field: UnityCapabilityField) {
    if (!selectedUnityAction) {
      return null;
    }

    const value = selectedUnityPayload[field.name] ?? getDefaultFieldValue(selectedUnityAction, field);

    if (field.kind === "boolean") {
      return (
        <label className="field field--checkbox" key={field.name}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updatePayloadField(field, event.target.checked)}
            disabled={saving}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (field.kind === "target") {
      const targets = selectedUnityAction.targets ?? [];

      return (
        <label className="field" key={field.name}>
          <span className="field__label">{field.label}</span>
          <select
            className="field__input"
            value={String(value ?? "")}
            onChange={(event) => updatePayloadField(field, event.target.value)}
            disabled={saving || targets.length === 0}
          >
            {targets.length === 0 ? <option value="">Unity не передала target-и</option> : null}
            {targets.map((target) => (
              <option value={target.id} key={target.id}>
                {target.name} ({target.id})
              </option>
            ))}
          </select>
          {targets.length > 0 ? (
            <span className="field__hint">
              {targets.find((target) => target.id === value)?.path ?? field.placeholder}
            </span>
          ) : null}
        </label>
      );
    }

    if (field.kind === "select") {
      const options = field.options ?? [];

      return (
        <label className="field" key={field.name}>
          <span className="field__label">{field.label}</span>
          <select
            className="field__input"
            value={String(value ?? "")}
            onChange={(event) => updatePayloadField(field, event.target.value)}
            disabled={saving || options.length === 0}
          >
            {options.length === 0 ? <option value="">Немає варіантів</option> : null}
            {options.map((option) => (
              <option value={option.id} key={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {options.length > 0 ? (
            <span className="field__hint">
              {options.find((option) => option.id === value)?.path ?? field.placeholder}
            </span>
          ) : null}
        </label>
      );
    }
    if (field.kind === "number") {
      return (
        <label className="field" key={field.name}>
          <span className="field__label">{field.label}</span>
          <input
            className="field__input"
            type="number"
            step="0.1"
            value={Number(value ?? 0)}
            onChange={(event) => updatePayloadField(field, Number(event.target.value))}
            disabled={saving}
          />
        </label>
      );
    }

    return (
      <label className="field" key={field.name}>
        <span className="field__label">{field.label}</span>
        <input
          className="field__input"
          type="text"
          value={String(value ?? "")}
          onChange={(event) => updatePayloadField(field, event.target.value)}
          placeholder={field.placeholder}
          disabled={saving}
        />
      </label>
    );
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);

    const validationError = validateForm(form);

    if (validationError) {
      setSaving(false);
      setSubmitError(validationError);
      return;
    }

    try {
      const payload = toDto(form);

      if (editingName) {
        await updateCustomCommand(editingName, {
          responseText: payload.responseText,
          enabled: payload.enabled,
          cooldownMs: payload.cooldownMs,
          replyMode: payload.replyMode,
          actionEnabled: payload.actionEnabled,
          targetTransports: payload.targetTransports,
          unrealEventName: payload.unrealEventName,
          unityEventName: payload.unityEventName,
          payloadTemplate: payload.payloadTemplate,
        });
      } else {
        await createCustomCommand(payload);
      }

      resetForm();
      await loadCommands();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Не вдалося зберегти команду",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    const confirmed = window.confirm(`Видалити команду !${name}?`);

    if (!confirmed) {
      return;
    }

    try {
      await deleteCustomCommand(name);

      if (editingName === name) {
        resetForm();
      }

      await loadCommands();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося видалити команду",
      );
    }
  }

  return (
    <div className="page">
      <HelpCommandCard />

      <div className="page-columns page-columns--align-start">
        {formOpen ? (
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">
                {editingName ? `Редагування !${editingName}` : "Створити кастомну команду"}
              </h2>
              <p className="card__subtitle">
                Керування кастомними командами для Twitch-чату
              </p>
            </div>
          </div>

          {submitError ? (
            <div className="state-block state-block--error">{submitError}</div>
          ) : null}

          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">Назва команди</span>
              <input
                className="field__input"
                type="text"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="jump"
                disabled={saving || Boolean(editingName)}
                required
              />
              <span className="field__hint">Без знака !</span>
            </label>

            <label className="field">
              <span className="field__label">Текст відповіді</span>
              <textarea
                className="field__input field__input--textarea"
                value={form.responseText}
                onChange={(event) => updateForm("responseText", event.target.value)}
                placeholder="@{user} triggered jump"
                disabled={saving}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Кулдаун (мс)</span>
              <input
                className="field__input"
                type="number"
                min={0}
                step={100}
                value={form.cooldownMs}
                onChange={(event) => updateForm("cooldownMs", Number(event.target.value) || 0)}
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field__label">Режим відповіді</span>
              <select
                className="field__input"
                value={form.replyMode}
                onChange={(event) => updateForm("replyMode", event.target.value as ReplyMode)}
                disabled={saving}
              >
                <option value="reply">reply</option>
                <option value="normal">normal</option>
              </select>
            </label>

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => updateForm("enabled", event.target.checked)}
                disabled={saving}
              />
              <span>Увімкнено</span>
            </label>

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={form.actionEnabled ?? false}
                onChange={(event) => updateForm("actionEnabled", event.target.checked)}
                disabled={saving}
              />
              <span>Увімкнути engine action</span>
            </label>

            {form.actionEnabled ? (
              <>
                <div className="field">
                  <span className="field__label">Target transports</span>
                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={hasTarget(form.targetTransports, "unreal")}
                      onChange={(event) => updateTargetTransport("unreal", event.target.checked)}
                      disabled={saving}
                    />
                    <span>Unreal</span>
                  </label>
                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={hasTarget(form.targetTransports, "unity")}
                      onChange={(event) => updateTargetTransport("unity", event.target.checked)}
                      disabled={saving}
                    />
                    <span>Unity</span>
                  </label>
                </div>

                {hasTarget(form.targetTransports, "unreal") ? (
                  <label className="field">
                    <span className="field__label">Unreal Event Name</span>
                    <input
                      className="field__input"
                      type="text"
                      value={form.unrealEventName ?? ""}
                      onChange={(event) => updateForm("unrealEventName", event.target.value)}
                      placeholder="jump"
                      disabled={saving}
                    />
                  </label>
                ) : null}

                {hasTarget(form.targetTransports, "unity") ? (
                  <>
                    <div className="field">
                      <span className="field__label">Unity actions</span>
                      <span className="field__hint">
                        {capabilitiesLoading
                          ? "Завантаження..."
                          : unityCapabilities
                            ? `${unityActions.length} actions, ${unityTargetCount} targets`
                            : "Очікую Unity scene у Play mode"}
                      </span>
                    </div>

                    {unityActions.length > 0 ? (
                      <label className="field">
                        <span className="field__label">Unity Action</span>
                        <select
                          className="field__input"
                          value={selectedUnityAction?.eventName ?? ""}
                          onChange={(event) => handleUnityActionChange(event.target.value)}
                          disabled={saving}
                        >
                          <option value="">Custom event</option>
                          {unityActions.map((action) => (
                            <option value={action.eventName} key={action.eventName}>
                              {action.label} ({action.eventName})
                            </option>
                          ))}
                        </select>
                        {selectedUnityAction?.description ? (
                          <span className="field__hint">{selectedUnityAction.description}</span>
                        ) : null}
                      </label>
                    ) : null}

                    <label className="field">
                      <span className="field__label">Unity Event Name</span>
                      <input
                        className="field__input"
                        type="text"
                        value={form.unityEventName ?? ""}
                        onChange={(event) => updateForm("unityEventName", event.target.value)}
                        placeholder="show_message"
                        disabled={saving}
                      />
                    </label>

                    {selectedUnityAction ? (
                      selectedUnityAction.fields.length > 0 ? (
                        selectedUnityAction.fields.map((field) => renderCapabilityField(field))
                      ) : (
                        <div className="field__hint">Цей Unity action не потребує payload.</div>
                      )
                    ) : null}
                  </>
                ) : null}

                <label className="field">
                  <span className="field__label">Payload Template (JSON, advanced)</span>
                  <textarea
                    className="field__input field__input--textarea"
                    value={form.payloadTemplateText}
                    onChange={(event) => updateForm("payloadTemplateText", event.target.value)}
                    placeholder={'{\n  "message": "{{userName}} used !{{commandName}} {{argsText}}"\n}'}
                    disabled={saving}
                    rows={8}
                  />
                </label>
              </>
            ) : null}

            <div className="actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Збереження..."
                  : editingName
                    ? "Оновити команду"
                    : "Створити команду"}
              </button>

              {editingName ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Скасувати
                </button>
              ) : null}
            </div>
          </form>
        </div>
        ) : null}

        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Команди</h2>
              <p className="card__subtitle">Поточний список кастомних команд</p>
            </div>

            {!formOpen ? (
              <div className="actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormOpen(true);
                  }}
                >
                  Створити команду
                </button>
              </div>
            ) : null}
          </div>

          {loading ? <div className="state-block">Завантаження...</div> : null}
          {error ? <div className="state-block state-block--error">{error}</div> : null}

          {!loading && !error && sortedCommands.length === 0 ? (
            <div className="state-block">Команд поки немає</div>
          ) : null}

          {!loading && !error && sortedCommands.length > 0 ? (
            <div className="events-list">
              {sortedCommands.map((command) => {
                const targets = normalizeTargets(command.targetTransports);

                return (
                  <article className="event-card" key={command.name}>
                    <div className="event-card__top">
                      <div className="event-card__meta">
                        <span className="badge badge--muted">!{command.name}</span>
                        <span
                          className={`badge ${
                            command.enabled ? "badge--success" : "badge--warning"
                          }`}
                        >
                          {command.enabled ? "увімкнено" : "вимкнено"}
                        </span>
                        <span className="badge badge--muted">
                          кулдаун: {command.cooldownMs} мс
                        </span>
                        <span className="badge badge--muted">
                          режим: {command.replyMode}
                        </span>
                        <span className={`badge ${command.actionEnabled ? "badge--success" : "badge--muted"}`}>
                          action: {command.actionEnabled ? "on" : "off"}
                        </span>
                        {targets.map((target) => (
                          <span className="badge badge--muted" key={target}>
                            {target}
                          </span>
                        ))}
                        {command.unityEventName ? (
                          <span className="badge badge--muted">Unity: {command.unityEventName}</span>
                        ) : null}
                        {command.unrealEventName ? (
                          <span className="badge badge--muted">Unreal: {command.unrealEventName}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="event-card__message">{command.responseText}</div>

                    <div className="actions">
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() => startEdit(command)}
                      >
                        Редагувати
                      </button>

                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() => handleDelete(command.name)}
                      >
                        Видалити
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}



