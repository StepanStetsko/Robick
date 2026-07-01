import { useEffect, useMemo, useRef, useState } from "react";
import {
  createRewardMapping,
  deleteRewardMapping,
  getRewardCatalog,
  updateRewardMapping,
} from "../api/rewards";
import type {
  CreateRewardMappingDto,
  RewardCatalog,
  RewardMapping,
  TwitchRewardCatalogItem,
  UpdateRewardMappingDto,
} from "../types/rewards";
import "../styles/ChannelPointsPage.css";

type FormState = {
  rewardId: string;
  rewardTitle: string;
  enabled: boolean;
  unrealEventName: string;
  payloadTemplateText: string;
};

const initialFormState: FormState = {
  rewardId: "",
  rewardTitle: "",
  enabled: true,
  unrealEventName: "",
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

function validateMappingForm(form: FormState): string | null {
  if (!normalizeText(form.rewardId)) {
    return "Потрібен Reward ID";
  }

  if (!normalizeText(form.rewardTitle)) {
    return "Потрібна назва reward";
  }

  if (!normalizeText(form.unrealEventName)) {
    return "Потрібна назва Unreal Event";
  }

  if (normalizeText(form.unrealEventName).length > 100) {
    return "Назва Unreal Event має бути не довша за 100 символів";
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
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [search, setSearch] = useState("");
  const [mappingFilter, setMappingFilter] = useState<"all" | "enabled" | "disabled">(
    "all",
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const eventNameDirtyRef = useRef(false);

  const isEditing = editingId !== null;

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
    setEditingId(null);
    setSuccessMessage("");
    setErrorMessage("");
    eventNameDirtyRef.current = false;
    setForm({
      rewardId: item.rewardId,
      rewardTitle: item.rewardTitle,
      enabled: true,
      unrealEventName: slugifyEventName(item.rewardTitle),
      payloadTemplateText: "",
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
      unrealEventName: item.unrealEventName,
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
        next.unrealEventName = slugifyEventName(String(value));
      }

      return next;
    });
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

      const payload: CreateRewardMappingDto = {
        rewardId: normalizeText(form.rewardId),
        rewardTitle: normalizeText(form.rewardTitle),
        enabled: form.enabled,
        unrealEventName: normalizeText(form.unrealEventName),
        payloadTemplate,
      };

      if (isEditing && editingId) {
        const updatePayload: UpdateRewardMappingDto = {
          rewardTitle: payload.rewardTitle,
          enabled: payload.enabled,
          unrealEventName: payload.unrealEventName,
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
            Зв’язування reward за бали каналу Twitch з подіями Unreal.
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

            <label>
              <span>Назва Unreal Event</span>
              <input
                value={form.unrealEventName}
                onChange={(event) => {
                  eventNameDirtyRef.current = true;
                  updateForm("unrealEventName", event.target.value);
                }}
                placeholder="spawn_zombie"
                disabled={submitting}
              />
              <small>
                Назва генерується з назви reward, поки ви не зміните її вручну.
              </small>
            </label>

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
              <span>Payload Template (JSON)</span>
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
                          <span
                            className={`cp-badge ${mapping.enabled ? "is-success" : "is-danger"}`}
                          >
                            {mapping.enabled ? "Мапінг увімкнено" : "Мапінг вимкнено"}
                          </span>
                        </div>
                      </div>

                      {item.prompt ? <div className="cp-item-prompt">{item.prompt}</div> : null}

                      <div>
                        <strong>Unreal Event:</strong> {mapping.unrealEventName}
                      </div>

                      <div className="cp-payload">
                        <strong>Payload:</strong>
                        <pre className="cp-pre">
                          {formatPayloadTemplate(mapping.payloadTemplate) || "null"}
                        </pre>
                      </div>

                      <div className="cp-item-actions">
                        <button type="button" onClick={() => selectMappedItem(item)}>
                          Редагувати
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleToggleEnabled(mapping)}
                        >
                          {mapping.enabled ? "Вимкнути мапінг" : "Увімкнути мапінг"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(mapping.id)}
                        >
                          Видалити мапінг
                        </button>
                      </div>
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
