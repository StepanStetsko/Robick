import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRewardMapping,
  deleteRewardMapping,
  getRewardCatalog,
  testRewardDispatch,
  updateRewardMapping,
} from "../api/rewards";
import { getUnityCapabilities } from "../api/engine";
import { subscribeToTwitchRealtime } from "../api/realtime";
import type {
  CreateRewardMappingDto,
  RewardCatalog,
  RewardMapping,
  RewardMappingTargetTransport,
  TwitchRewardCatalogItem,
  UpdateRewardMappingDto,
} from "../types/rewards";
import type {
  UnityCapabilities,
  UnityCapabilityAction,
  UnityCapabilityField,
} from "../types/engine";
import "../styles/ChannelPointsPage.css";

type FormState = {
  rewardId: string;
  rewardTitle: string;
  enabled: boolean;
  unrealEventName: string;
  unityEventName: string;
  targetTransports: RewardMappingTargetTransport[];
  payloadTemplateText: string;
};

const initialFormState: FormState = {
  rewardId: "",
  rewardTitle: "",
  enabled: true,
  unrealEventName: "",
  unityEventName: "",
  targetTransports: ["unity"],
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

function buildPayloadTemplate(payloadTemplateText: string): unknown | null {
  const trimmed = payloadTemplateText.trim();

  if (!trimmed) {
    return null;
  }

  return JSON.parse(trimmed);
}

function normalizeText(value: string): string {
  return value.trim();
}

function slugifyEventName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/["'’`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

function normalizeTargetTransports(
  value: RewardMappingTargetTransport[] | null | undefined,
): RewardMappingTargetTransport[] {
  const transports = new Set<RewardMappingTargetTransport>();

  for (const item of value ?? []) {
    if (item === "unreal" || item === "unity") {
      transports.add(item);
    }
  }

  return transports.size > 0 ? [...transports] : ["unreal"];
}

function hasTarget(
  transports: RewardMappingTargetTransport[],
  target: RewardMappingTargetTransport,
): boolean {
  return transports.includes(target);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayloadTemplateObject(payloadTemplateText: string): Record<string, unknown> {
  try {
    const parsed: unknown = buildPayloadTemplate(payloadTemplateText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getDefaultFieldValue(
  action: UnityCapabilityAction,
  field: UnityCapabilityField,
): unknown {
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
  eventName: string,
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

function validateMappingForm(form: FormState): string | null {
  if (!normalizeText(form.rewardId)) {
    return "Потрібен Reward ID";
  }

  if (!normalizeText(form.rewardTitle)) {
    return "Потрібна назва reward";
  }

  if (form.targetTransports.length === 0) {
    return "Select at least one target transport";
  }

  if (hasTarget(form.targetTransports, "unreal") && !normalizeText(form.unrealEventName)) {
    return "Unreal Event name is required";
  }

  if (normalizeText(form.unrealEventName).length > 100) {
    return "Unreal Event name must be 100 characters or fewer";
  }

  if (hasTarget(form.targetTransports, "unity") && !normalizeText(form.unityEventName)) {
    return "Unity Event name is required";
  }

  if (normalizeText(form.unityEventName).length > 100) {
    return "Unity Event name must be 100 characters or fewer";
  }

  try {
    buildPayloadTemplate(form.payloadTemplateText);
  } catch {
    return "Payload Template має бути валідним JSON";
  }

  return null;
}

function rewardMatchesQuery(item: TwitchRewardCatalogItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    item.rewardId,
    item.rewardTitle,
    item.mapping?.unrealEventName ?? "",
    item.mapping?.unityEventName ?? "",
    item.mapping?.targetTransports?.join(" ") ?? "",
    item.prompt,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function getRewardStateBadge(item: TwitchRewardCatalogItem): {
  label: string;
  className: string;
} {
  if (!item.isEnabled) {
    return { label: "Вимкнено на Twitch", className: "is-danger" };
  }

  if (item.isPaused) {
    return { label: "Пауза на Twitch", className: "is-warn" };
  }

  if (!item.isInStock) {
    return { label: "Немає в наявності", className: "is-danger" };
  }

  return { label: "Активно на Twitch", className: "is-success" };
}

export function ChannelPointsPage() {
  const [catalog, setCatalog] = useState<RewardCatalog>({ mapped: [], unmapped: [] });
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testingRewardId, setTestingRewardId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [expandedMappedRewardIds, setExpandedMappedRewardIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [search, setSearch] = useState("");
  const [mappingFilter, setMappingFilter] = useState<"all" | "enabled" | "disabled">(
    "all",
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [unityCapabilities, setUnityCapabilities] = useState<UnityCapabilities | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const eventNameDirtyRef = useRef(false);

  const isEditing = editingId !== null;

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

  const filteredMapped = useMemo(() => {
    const query = search.trim().toLowerCase();

    return catalog.mapped.filter((item) => {
      const matchesSearch = rewardMatchesQuery(item, query);
      const mappingEnabled = item.mapping?.enabled ?? false;
      const matchesMappingFilter =
        mappingFilter === "all" ||
        (mappingFilter === "enabled" && mappingEnabled) ||
        (mappingFilter === "disabled" && !mappingEnabled);

      return matchesSearch && matchesMappingFilter;
    });
  }, [catalog.mapped, mappingFilter, search]);

  const filteredUnmapped = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.unmapped.filter((item) => rewardMatchesQuery(item, query));
  }, [catalog.unmapped, search]);

  async function loadUnityCapabilities() {
    setCapabilitiesLoading(true);

    try {
      const capabilities = await getUnityCapabilities();
      setUnityCapabilities(capabilities);
    } catch {
      setUnityCapabilities(null);
    } finally {
      setCapabilitiesLoading(false);
    }
  }

  async function loadCatalog(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    if (silent) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }

    setErrorMessage("");

    try {
      const data = await getRewardCatalog();
      setCatalog(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не вдалося завантажити каталог reward",
      );
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadCatalog();
    void loadUnityCapabilities();
  }, []);

  useEffect(() => {
    return subscribeToTwitchRealtime({
      onSnapshot: (data) => {
        if (data.engineCapabilities) {
          setUnityCapabilities(data.engineCapabilities.unity);
        }
      },
      onEngineCapabilities: (data) => {
        setUnityCapabilities(data.unity);
      },
    });
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadCatalog({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefreshEnabled]);

  function resetForm() {
    setEditingId(null);
    setForm(initialFormState);
    eventNameDirtyRef.current = false;
  }

  function selectRewardForCreate(item: TwitchRewardCatalogItem) {
    const defaultAction = getDefaultUnityAction(unityCapabilities);

    setEditingId(null);
    setSuccessMessage("");
    setErrorMessage("");
    eventNameDirtyRef.current = false;
    setForm({
      rewardId: item.rewardId,
      rewardTitle: item.rewardTitle,
      enabled: true,
      unrealEventName: "",
      unityEventName: defaultAction?.eventName ?? slugifyEventName(item.rewardTitle),
      targetTransports: ["unity"],
      payloadTemplateText: defaultAction
        ? formatPayloadTemplate(buildDefaultPayloadForAction(defaultAction))
        : "",
    });
  }

  function startEdit(item: RewardMapping) {
    setEditingId(item.id);
    setSuccessMessage("");
    setErrorMessage("");
    eventNameDirtyRef.current = true;
    setForm({
      rewardId: item.rewardId,
      rewardTitle: item.rewardTitle,
      enabled: item.enabled,
      unrealEventName: item.unrealEventName ?? "",
      unityEventName: item.unityEventName ?? "",
      targetTransports: normalizeTargetTransports(item.targetTransports),
      payloadTemplateText: formatPayloadTemplate(item.payloadTemplate),
    });
  }

  function selectMappedItem(item: TwitchRewardCatalogItem) {
    if (!item.mapping) {
      return;
    }

    startEdit(item.mapping);
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "rewardTitle" && !isEditing && !eventNameDirtyRef.current) {
        const eventName = slugifyEventName(String(value));

        if (next.targetTransports.includes("unreal")) {
          next.unrealEventName = eventName;
        }

        if (next.targetTransports.includes("unity") && !next.unityEventName) {
          next.unityEventName = eventName;
        }
      }

      return next;
    });
  }

  function updateTargetTransport(
    target: RewardMappingTargetTransport,
    enabled: boolean,
  ) {
    setForm((prev) => {
      const transports = new Set(prev.targetTransports);

      if (enabled) {
        transports.add(target);
      } else if (transports.size > 1) {
        transports.delete(target);
      }

      const next = {
        ...prev,
        targetTransports: [...transports],
      };

      if (target === "unity" && enabled && !next.unityEventName) {
        const defaultAction = getDefaultUnityAction(unityCapabilities);
        next.unityEventName =
          (defaultAction?.eventName ?? next.unrealEventName) ||
          slugifyEventName(next.rewardTitle);

        if (defaultAction && !next.payloadTemplateText.trim()) {
          next.payloadTemplateText = formatPayloadTemplate(buildDefaultPayloadForAction(defaultAction));
        }
      }

      if (target === "unreal" && enabled && !next.unrealEventName) {
        next.unrealEventName = next.unityEventName || slugifyEventName(next.rewardTitle);
      }

      return next;
    });
  }

  function handleUnityActionChange(eventName: string) {
    const action = findUnityAction(unityCapabilities, eventName);

    setForm((prev) => ({
      ...prev,
      unityEventName: eventName,
      payloadTemplateText: action
        ? formatPayloadTemplate(buildDefaultPayloadForAction(action))
        : prev.payloadTemplateText,
    }));
  }

  function updatePayloadField(field: UnityCapabilityField, value: unknown) {
    setForm((prev) => {
      const payload = parsePayloadTemplateObject(prev.payloadTemplateText);
      payload[field.name] = value;

      return {
        ...prev,
        payloadTemplateText: formatPayloadTemplate(payload),
      };
    });
  }

  function renderCapabilityField(field: UnityCapabilityField) {
    const value = selectedUnityPayload[field.name] ?? getDefaultFieldValue(selectedUnityAction!, field);
    const fieldId = `unity-payload-${field.name}`;

    if (field.kind === "boolean") {
      return (
        <label className="cp-checkbox" key={field.name}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updatePayloadField(field, event.target.checked)}
            disabled={submitting}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (field.kind === "target") {
      const targets = selectedUnityAction?.targets ?? [];

      return (
        <label key={field.name}>
          <span>{field.label}</span>
          <select
            id={fieldId}
            value={String(value ?? "")}
            onChange={(event) => updatePayloadField(field, event.target.value)}
            disabled={submitting || targets.length === 0}
          >
            {targets.length === 0 ? (
              <option value="">Unity не передала target-и</option>
            ) : null}
            {targets.map((target) => (
              <option value={target.id} key={target.id}>
                {target.name} ({target.id})
              </option>
            ))}
          </select>
          {targets.length > 0 ? (
            <small>
              {targets.find((target) => target.id === value)?.path ?? field.placeholder}
            </small>
          ) : null}
        </label>
      );
    }

    if (field.kind === "select") {
      const options = field.options ?? [];

      return (
        <label key={field.name}>
          <span>{field.label}</span>
          <select
            id={fieldId}
            value={String(value ?? "")}
            onChange={(event) => updatePayloadField(field, event.target.value)}
            disabled={submitting || options.length === 0}
          >
            {options.length === 0 ? <option value="">Немає варіантів</option> : null}
            {options.map((option) => (
              <option value={option.id} key={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {options.length > 0 ? (
            <small>{options.find((option) => option.id === value)?.path ?? field.placeholder}</small>
          ) : null}
        </label>
      );
    }
    if (field.kind === "number") {
      return (
        <label key={field.name}>
          <span>{field.label}</span>
          <input
            id={fieldId}
            type="number"
            step="0.1"
            value={Number(value ?? 0)}
            onChange={(event) => updatePayloadField(field, Number(event.target.value))}
            disabled={submitting}
          />
        </label>
      );
    }

    return (
      <label key={field.name}>
        <span>{field.label}</span>
        <input
          id={fieldId}
          value={String(value ?? "")}
          onChange={(event) => updatePayloadField(field, event.target.value)}
          placeholder={field.placeholder}
          disabled={submitting}
        />
      </label>
    );
  }
  async function refreshAfterMutation(success: string) {
    await loadCatalog({ silent: true });
    setSuccessMessage(success);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const validationError = validateMappingForm(form);

    if (validationError) {
      setSubmitting(false);
      setErrorMessage(validationError);
      return;
    }

    try {
      const payloadTemplate = buildPayloadTemplate(form.payloadTemplateText);
      const targetTransports = normalizeTargetTransports(form.targetTransports);

      const payload: CreateRewardMappingDto = {
        rewardId: normalizeText(form.rewardId),
        rewardTitle: normalizeText(form.rewardTitle),
        enabled: form.enabled,
        unrealEventName: hasTarget(targetTransports, "unreal")
          ? normalizeText(form.unrealEventName)
          : null,
        unityEventName: hasTarget(targetTransports, "unity")
          ? normalizeText(form.unityEventName)
          : null,
        targetTransports,
        payloadTemplate,
      };

      if (isEditing && editingId) {
        const updatePayload: UpdateRewardMappingDto = {
          rewardTitle: payload.rewardTitle,
          enabled: payload.enabled,
          unrealEventName: payload.unrealEventName,
          unityEventName: payload.unityEventName,
          targetTransports: payload.targetTransports,
          payloadTemplate: payload.payloadTemplate,
        };

        await updateRewardMapping(editingId, updatePayload);
        await refreshAfterMutation("Мапінг reward оновлено");
      } else {
        await createRewardMapping(payload);
        await refreshAfterMutation("Мапінг reward створено");
      }

      resetForm();
    } catch (error) {
      if (error instanceof SyntaxError) {
        setErrorMessage("Payload Template має бути валідним JSON");
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : "Не вдалося зберегти мапінг reward",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Видалити цей мапінг reward?");
    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteRewardMapping(id);

      if (editingId === id) {
        resetForm();
      }

      await refreshAfterMutation("Мапінг reward видалено");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не вдалося видалити мапінг reward",
      );
    }
  }

  async function handleTestDispatch(rewardId: string) {
    setErrorMessage("");
    setSuccessMessage("");
    setTestingRewardId(rewardId);

    try {
      const result = await testRewardDispatch({ rewardId });
      setSuccessMessage(
        result.dispatched
          ? `Test dispatch delivered: ${result.redemptionId}`
          : `Test dispatch queued: ${result.redemptionId}`,
      );
      await loadCatalog({ silent: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не вдалося виконати test dispatch",
      );
    } finally {
      setTestingRewardId(null);
    }
  }

  function toggleMappedRewardExpanded(rewardId: string) {
    setExpandedMappedRewardIds((current) => {
      const next = new Set(current);

      if (next.has(rewardId)) {
        next.delete(rewardId);
      } else {
        next.add(rewardId);
      }

      return next;
    });
  }
  async function handleToggleEnabled(item: RewardMapping) {
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await updateRewardMapping(item.id, {
        enabled: !item.enabled,
      });

      await refreshAfterMutation(
        item.enabled ? "Мапінг reward вимкнено" : "Мапінг reward увімкнено",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Не вдалося оновити мапінг reward",
      );
    }
  }

  return (
    <div className="page cp-page">
      <div className="cp-header">
        <div>
          <h1>Бали каналу</h1>
          <p className="cp-subtitle">
            Зв’язування reward за бали каналу Twitch з подіями Unreal або Unity.
          </p>
        </div>

        <div className="cp-actions">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Пошук по reward, prompt або event"
            disabled={initialLoading}
          />

          <select
            value={mappingFilter}
            onChange={(event) =>
              setMappingFilter(event.target.value as "all" | "enabled" | "disabled")
            }
            disabled={initialLoading}
          >
            <option value="all">Усі мапінги</option>
            <option value="enabled">Увімкнені мапінги</option>
            <option value="disabled">Вимкнені мапінги</option>
          </select>

          <label className="cp-inline-checkbox">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
            />
            <span>Автооновлення</span>
          </label>

          {refreshing ? <span className="cp-refreshing">Оновлення...</span> : null}

          <button
            type="button"
            onClick={() => void loadCatalog({ silent: true })}
            disabled={initialLoading || refreshing}
          >
            {refreshing ? "Оновлення..." : "Оновити"}
          </button>

          <button type="button" onClick={resetForm} disabled={submitting}>
            {isEditing ? "Скасувати редагування" : "Очистити форму"}
          </button>
        </div>
      </div>

      {errorMessage ? <div className="cp-error">{errorMessage}</div> : null}
      {successMessage ? <div className="cp-success">{successMessage}</div> : null}

      <div className="cp-layout">
        <section className="cp-card cp-form-card">
          <div className="cp-card-header">
            <div>
              <h2>{isEditing ? "Редагування мапінгу" : "Створення мапінгу"}</h2>
              <p>
                {isEditing
                  ? "Оновіть вибраний мапінг reward."
                  : "Натисніть reward праворуч, щоб автоматично заповнити форму."}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="cp-form">
            <label>
              <span>Reward ID</span>
              <input
                value={form.rewardId}
                onChange={(event) => updateForm("rewardId", event.target.value)}
                placeholder="Оберіть reward з каталогу"
                disabled={submitting || isEditing}
              />
              <small>
                {isEditing
                  ? "Reward ID блокується після створення мапінгу."
                  : "Зазвичай вручну це поле вводити не потрібно."}
              </small>
            </label>

            <label>
              <span>Назва reward</span>
              <input
                value={form.rewardTitle}
                onChange={(event) => updateForm("rewardTitle", event.target.value)}
                placeholder="Назва reward"
                disabled={submitting}
              />
            </label>

            <div className="cp-targets">
              <span>Target transports</span>
              <label className="cp-checkbox">
                <input
                  type="checkbox"
                  checked={hasTarget(form.targetTransports, "unreal")}
                  onChange={(event) =>
                    updateTargetTransport("unreal", event.target.checked)
                  }
                  disabled={
                    submitting ||
                    (hasTarget(form.targetTransports, "unreal") &&
                      form.targetTransports.length === 1)
                  }
                />
                <span>Unreal</span>
              </label>
              <label className="cp-checkbox">
                <input
                  type="checkbox"
                  checked={hasTarget(form.targetTransports, "unity")}
                  onChange={(event) =>
                    updateTargetTransport("unity", event.target.checked)
                  }
                  disabled={
                    submitting ||
                    (hasTarget(form.targetTransports, "unity") &&
                      form.targetTransports.length === 1)
                  }
                />
                <span>Unity</span>
              </label>
            </div>

            {hasTarget(form.targetTransports, "unreal") ? (
              <label>
                <span>Unreal Event Name</span>
                <input
                  value={form.unrealEventName}
                  onChange={(event) => {
                    eventNameDirtyRef.current = true;
                    updateForm("unrealEventName", event.target.value);
                  }}
                  placeholder="spawn_zombie"
                  disabled={submitting}
                />
              </label>
            ) : null}

            {hasTarget(form.targetTransports, "unity") ? (
              <div className="cp-unity-capabilities">
                <div className="cp-capability-status">
                  <span>Unity actions</span>
                  <small>
                    {capabilitiesLoading
                      ? "Завантаження..."
                      : unityCapabilities
                        ? `${unityActions.length} actions, ${unityTargetCount} targets`
                        : "Очікую Unity scene у Play mode"}
                  </small>
                </div>

                {unityActions.length > 0 ? (
                  <label>
                    <span>Unity Action</span>
                    <select
                      value={selectedUnityAction?.eventName ?? ""}
                      onChange={(event) => handleUnityActionChange(event.target.value)}
                      disabled={submitting}
                    >
                      <option value="">Custom event</option>
                      {unityActions.map((action) => (
                        <option value={action.eventName} key={action.eventName}>
                          {action.label} ({action.eventName})
                        </option>
                      ))}
                    </select>
                    {selectedUnityAction?.description ? (
                      <small>{selectedUnityAction.description}</small>
                    ) : null}
                  </label>
                ) : null}

                <label>
                  <span>Unity Event Name</span>
                  <input
                    value={form.unityEventName}
                    onChange={(event) => updateForm("unityEventName", event.target.value)}
                    placeholder="show_message"
                    disabled={submitting}
                  />
                </label>

                {selectedUnityAction ? (
                  <div className="cp-capability-fields">
                    {selectedUnityAction.fields.length > 0 ? (
                      selectedUnityAction.fields.map((field) => renderCapabilityField(field))
                    ) : (
                      <small>Цей Unity action не потребує payload.</small>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="cp-checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => updateForm("enabled", event.target.checked)}
                disabled={submitting}
              />
              <span>Мапінг увімкнено</span>
            </label>

            <label>
              <span>Payload Template (JSON, advanced)</span>
              <textarea
                value={form.payloadTemplateText}
                onChange={(event) => updateForm("payloadTemplateText", event.target.value)}
                placeholder={'{\n  "count": 1,\n  "target": "player"\n}'}
                rows={10}
                disabled={submitting}
              />
            </label>

            <button type="submit" disabled={submitting}>
              {submitting
                ? isEditing
                  ? "Збереження..."
                  : "Створення..."
                : isEditing
                  ? "Зберегти зміни"
                  : "Створити мапінг"}
            </button>
          </form>
        </section>

        <section className="cp-columns">
          <div className="cp-card">
            <div className="cp-card-header">
              <div>
                <h2>Змаплені reward</h2>
                <p>{filteredMapped.length} елементів</p>
              </div>
            </div>

            {initialLoading ? <p>Завантаження...</p> : null}
            {!initialLoading && filteredMapped.length === 0 ? (
              <p>Змаплених reward не знайдено.</p>
            ) : null}

            {!initialLoading && filteredMapped.length > 0 ? (
              <div className="cp-list">
                {filteredMapped.map((item) => {
                  const stateBadge = getRewardStateBadge(item);
                  const mapping = item.mapping;

                  if (!mapping) {
                    return null;
                  }

                  const expanded = expandedMappedRewardIds.has(item.rewardId);

                  return (
                    <article
                      key={item.rewardId}
                      className={`cp-item cp-item--mapped ${expanded ? "is-expanded" : ""}`}
                    >
                      <div
                        className="cp-mapped-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleMappedRewardExpanded(item.rewardId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleMappedRewardExpanded(item.rewardId);
                          }
                        }}
                      >
                        <div className="cp-mapped-title">
                          <span className="cp-expand-indicator">{expanded ? "−" : "+"}</span>
                          <div>
                            <div className="cp-item-title">{item.rewardTitle}</div>
                            <div className="cp-item-sub">
                              rewardId: {item.rewardId} · cost: {item.rewardCost}
                            </div>
                          </div>
                        </div>

                        <div className="cp-mapped-actions" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => void handleTestDispatch(item.rewardId)}
                            disabled={testingRewardId === item.rewardId}
                          >
                            {testingRewardId === item.rewardId ? "Testing..." : "Test dispatch"}
                          </button>

                          <button type="button" onClick={() => selectMappedItem(item)}>
                            Редагувати
                          </button>

                          <button
                            type="button"
                            className={`cp-status-button ${mapping.enabled ? "is-success" : "is-danger"}`}
                            onClick={() => void handleToggleEnabled(mapping)}
                          >
                            {mapping.enabled ? "Мапінг увімкнено" : "Мапінг вимкнено"}
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="cp-mapped-details">
                          <div className="cp-badges">
                            <span className={`cp-badge ${stateBadge.className}`}>
                              {stateBadge.label}
                            </span>
                            {normalizeTargetTransports(mapping.targetTransports).map((target) => (
                              <span className="cp-badge is-neutral" key={target}>
                                {target}
                              </span>
                            ))}
                          </div>

                          {item.prompt ? <div className="cp-item-prompt">{item.prompt}</div> : null}

                          {mapping.unrealEventName ? (
                            <div>
                              <strong>Unreal Event:</strong> {mapping.unrealEventName}
                            </div>
                          ) : null}

                          {mapping.unityEventName ? (
                            <div>
                              <strong>Unity Event:</strong> {mapping.unityEventName}
                            </div>
                          ) : null}

                          <div className="cp-payload">
                            <strong>Payload:</strong>
                            <pre className="cp-pre">
                              {formatPayloadTemplate(mapping.payloadTemplate) || "null"}
                            </pre>
                          </div>

                          <div className="cp-item-actions">
                            <button
                              type="button"
                              onClick={() => void handleDelete(mapping.id)}
                            >
                              Видалити мапінг
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="cp-card">
            <div className="cp-card-header">
              <div>
                <h2>Незмаплені reward</h2>
                <p>{filteredUnmapped.length} елементів</p>
              </div>
            </div>

            {initialLoading ? <p>Завантаження...</p> : null}
            {!initialLoading && filteredUnmapped.length === 0 ? (
              <p>Незмаплених reward не знайдено.</p>
            ) : null}

            {!initialLoading && filteredUnmapped.length > 0 ? (
              <div className="cp-list">
                {filteredUnmapped.map((item) => {
                  const stateBadge = getRewardStateBadge(item);

                  return (
                    <article key={item.rewardId} className="cp-item">
                      <div className="cp-item-header">
                        <div>
                          <div className="cp-item-title">{item.rewardTitle}</div>
                          <div className="cp-item-sub">
                            rewardId: {item.rewardId} · cost: {item.rewardCost}
                          </div>
                        </div>

                        <div className="cp-badges">
                          <span className={`cp-badge ${stateBadge.className}`}>
                            {stateBadge.label}
                          </span>
                          <span className="cp-badge is-neutral">Без мапінгу</span>
                        </div>
                      </div>

                      {item.prompt ? <div className="cp-item-prompt">{item.prompt}</div> : null}

                      <div className="cp-item-actions">
                        <button type="button" onClick={() => selectRewardForCreate(item)}>
                          Створити мапінг
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}








