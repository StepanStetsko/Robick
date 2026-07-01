import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createFunMeterFeature,
  getFunMeterFeatures,
  getFunMeterViewers,
  resetFunMeterUser,
  testFunMeterRoll,
  updateFunMeterFeature,
} from "../api/funMeter";
import { subscribeToTwitchRealtime } from "../api/realtime";
import type {
  FunMeterFeature,
  FunMeterJokeBucketKey,
  FunMeterJokes,
  FunMeterMessages,
  FunMeterRollResult,
  FunMeterRollLimitMode,
  FunMeterViewerStat,
  SaveFunMeterFeatureDto,
} from "../types/funMeter";

const defaultJokes: FunMeterJokes = {
  increaseLow: ["Трохи підросло, але вже приємно."],
  increaseMedium: ["Рулетка схвально кивнула."],
  increaseHigh: ["Статистика зробила широкий жест."],
  decreaseLow: ["Маленький мінус, велика драма."],
  decreaseMedium: ["Сьогодні показник трохи соромиться."],
  decreaseHigh: ["Результат пішов у режим економії."],
  zeroBlocked: ["Мінусувати повітря заборонено."],
};

const defaultMessages: FunMeterMessages = {
  rollMessage: "{deltaWithSign} {unit}. {joke}",
  zeroBlockedMessage: "бот хотів відняти {amount}, але там уже 0. {joke}",
  rollChatMessage: "@{displayName} {message} Загалом: {score} {unit}.",
  zeroBlockedChatMessage: "@{displayName}, {message}",
  dailyLimitMessage:
    "@{displayName}, «{title}» можна використовувати раз на добу. Спробуй після опівночі або після перезапуску бота.",
  leaderboardTitle: "🏆 Топ «{title}»:",
  leaderboardEmpty: "🏆 Топ «{title}» поки порожній.",
  leaderboardEntry: "{rank}. {displayName} — {score} {unit}",
  selfScoreMessage:
    "@{displayName}, твій поточний результат у «{title}»: {score} {unit}. Позиція в рейтингу: #{rank}.",
  unknownSubcommandMessage:
    "@{displayName}, доступно: !{alias}, !{alias} top, !{alias} me.",
};

type FormState = {
  key: string;
  title: string;
  unit: string;
  enabled: boolean;
  aliasesText: string;
  leaderboardArgsText: string;
  selfArgsText: string;
  rollLimitMode: FunMeterRollLimitMode;
  increaseChance: number;
  minRoll: number;
  maxRoll: number;
  jokes: FunMeterJokes;
  messages: FunMeterMessages;
};

const emptyForm: FormState = {
  key: "",
  title: "",
  unit: "см",
  enabled: true,
  aliasesText: "",
  leaderboardArgsText: "top, leaderboard, лідери, топ",
  selfArgsText: "me, my, я, мій, моє",
  rollLimitMode: "daily",
  increaseChance: 0.6,
  minRoll: 1,
  maxRoll: 20,
  jokes: defaultJokes,
  messages: defaultMessages,
};

const jokeBuckets: { key: FunMeterJokeBucketKey; label: string }[] = [
  { key: "increaseLow", label: "Зростання — мале" },
  { key: "increaseMedium", label: "Зростання — середнє" },
  { key: "increaseHigh", label: "Зростання — велике" },
  { key: "decreaseLow", label: "Спад — малий" },
  { key: "decreaseMedium", label: "Спад — середній" },
  { key: "decreaseHigh", label: "Спад — великий" },
  { key: "zeroBlocked", label: "Спроба нижче нуля" },
];

const funMeterMessageFields: {
  key: keyof FunMeterMessages;
  label: string;
  hint?: string;
}[] = [
  {
    key: "rollMessage",
    label: "Результат ролу",
    hint: "{deltaWithSign}, {unit}, {joke}",
  },
  {
    key: "zeroBlockedMessage",
    label: "Блок на нулі",
    hint: "{amount}, {joke}",
  },
  {
    key: "rollChatMessage",
    label: "Ролл — у чат",
    hint: "{displayName}, {message}, {score}, {unit}",
  },
  {
    key: "zeroBlockedChatMessage",
    label: "Блок на нулі — у чат",
    hint: "{displayName}, {message}",
  },
  {
    key: "dailyLimitMessage",
    label: "Денний ліміт",
    hint: "{displayName}, {title}",
  },
  { key: "leaderboardTitle", label: "Топ — заголовок", hint: "{title}" },
  { key: "leaderboardEmpty", label: "Топ — порожньо", hint: "{title}" },
  {
    key: "leaderboardEntry",
    label: "Топ — рядок",
    hint: "{rank}, {displayName}, {score}, {unit}",
  },
  {
    key: "selfScoreMessage",
    label: "Свій результат",
    hint: "{displayName}, {title}, {score}, {rank}, {unit}",
  },
  {
    key: "unknownSubcommandMessage",
    label: "Невідома підкоманда",
    hint: "{displayName}, {alias}",
  },
];

export function FunMeterPage() {
  const [features, setFeatures] = useState<FunMeterFeature[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [viewers, setViewers] = useState<FunMeterViewerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<FunMeterRollResult | null>(null);
  const [activeTab, setActiveTab] = useState<"basic" | "jokes" | "messages">("basic");

  const selectedFeature = useMemo(
    () => features.find((feature) => feature.key === selectedKey) ?? null,
    [features, selectedKey],
  );

  const topScore = useMemo(
    () => viewers.reduce((max, item) => Math.max(max, item.score), 0),
    [viewers],
  );

  async function loadFeatures() {
    setError(null);

    try {
      const result = await getFunMeterFeatures();
      setFeatures(result);
      setSelectedKey((current) => current || result[0]?.key || "");
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити метри");
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function loadViewers(featureKey: string) {
    if (!featureKey) {
      setViewers([]);
      return;
    }

    setError(null);

    try {
      setViewers(await getFunMeterViewers(featureKey, 50));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити fun stats");
    }
  }

  async function handleTestRoll() {
    if (!selectedFeature) {
      return;
    }

    setRolling(true);
    setError(null);

    try {
      const result = await testFunMeterRoll(selectedFeature.key);
      setLastRoll(result);
      await loadViewers(selectedFeature.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося виконати test roll");
    } finally {
      setRolling(false);
    }
  }

  async function handleDeleteViewer(viewer: FunMeterViewerStat) {
    if (!selectedFeature) {
      return;
    }

    const viewerName = viewer.displayName || viewer.userLogin;
    const confirmed = window.confirm(
      `Видалити ${viewerName} з таблиці «${selectedFeature.title}»?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(viewer.twitchUserId);
    setError(null);

    try {
      await resetFunMeterUser(selectedFeature.key, viewer.twitchUserId);
      await loadViewers(selectedFeature.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити viewer");
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);

    try {
      const payload = formToDto(form);

      if (editingKey) {
        await updateFunMeterFeature(editingKey, payload);
      } else {
        await createFunMeterFeature(payload);
      }

      resetForm();
      const loaded = await loadFeatures();
      const nextKey = editingKey || payload.key;
      setSelectedKey(nextKey);
      if (loaded.some((feature) => feature.key === nextKey)) {
        await loadViewers(nextKey);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не вдалося зберегти meter");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(feature: FunMeterFeature) {
    setEditingKey(feature.key);
    setFormOpen(true);
    setActiveTab("basic");
    setForm({
      key: feature.key,
      title: feature.title,
      unit: feature.unit,
      enabled: feature.enabled,
      aliasesText: feature.aliases.join(", "),
      leaderboardArgsText: feature.leaderboardArgs.join(", "),
      selfArgsText: feature.selfArgs.join(", "),
      rollLimitMode: feature.rollLimitMode,
      increaseChance: feature.increaseChance,
      minRoll: feature.minRoll,
      maxRoll: feature.maxRoll,
      jokes: feature.jokes,
      messages: feature.messages,
    });
    setSubmitError(null);
  }

  function resetForm() {
    setEditingKey(null);
    setForm(emptyForm);
    setSubmitError(null);
    setFormOpen(false);
    setActiveTab("basic");
  }

  useEffect(() => {
    void loadFeatures();

    const unsubscribe = subscribeToTwitchRealtime({
      onFunMeterRoll: (result) => {
        setLastRoll(result);
        if (result.featureKey === selectedKey) {
          void loadViewers(result.featureKey);
        }
      },
      onFunMeterLeaderboardChanged: (data) => {
        if (data.featureKey === selectedKey) {
          setViewers(Array.isArray(data.leaderboard) ? data.leaderboard : []);
          setLoading(false);
        }
      },
      onFunMeterFeaturesChanged: (items) => {
        setFeatures(Array.isArray(items) ? items : []);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [selectedKey]);

  useEffect(() => {
    void loadViewers(selectedKey);
  }, [selectedKey]);

  return (
    <div className="page">
      <div className="page-columns page-columns--align-start">
        {formOpen ? (
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">
                {editingKey ? `Редагування ${editingKey}` : "Новий fun meter"}
              </h2>
              <p className="card__subtitle">Команди, aliases, жарти і roll-діапазон</p>
            </div>
          </div>

          {submitError ? (
            <div className="state-block state-block--error">{submitError}</div>
          ) : null}

          <div className="tabs__nav" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "basic"}
              className={
                activeTab === "basic" ? "tab-button tab-button--active" : "tab-button"
              }
              onClick={() => setActiveTab("basic")}
            >
              Основне
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "jokes"}
              className={
                activeTab === "jokes" ? "tab-button tab-button--active" : "tab-button"
              }
              onClick={() => setActiveTab("jokes")}
            >
              Жарти
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "messages"}
              className={
                activeTab === "messages" ? "tab-button tab-button--active" : "tab-button"
              }
              onClick={() => setActiveTab("messages")}
            >
              Повідомлення
            </button>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {activeTab === "basic" ? (
              <>
            <label className="field">
              <span className="field__label">Internal key</span>
              <input
                className="field__input"
                value={form.key}
                onChange={(event) => setFormValue("key", event.target.value)}
                placeholder="luck_meter"
                disabled={saving || Boolean(editingKey)}
                required
              />
              <span className="field__hint">lowercase latin, numbers, underscore</span>
            </label>

            <label className="field">
              <span className="field__label">Назва</span>
              <input
                className="field__input"
                value={form.title}
                onChange={(event) => setFormValue("title", event.target.value)}
                placeholder="Вимір удачі"
                disabled={saving}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Одиниця</span>
              <input
                className="field__input"
                value={form.unit}
                onChange={(event) => setFormValue("unit", event.target.value)}
                placeholder="%"
                disabled={saving}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Aliases</span>
              <input
                className="field__input"
                value={form.aliasesText}
                onChange={(event) => setFormValue("aliasesText", event.target.value)}
                placeholder="luck, удача, фарт"
                disabled={saving}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Leaderboard args</span>
              <input
                className="field__input"
                value={form.leaderboardArgsText}
                onChange={(event) =>
                  setFormValue("leaderboardArgsText", event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field__label">Self args</span>
              <input
                className="field__input"
                value={form.selfArgsText}
                onChange={(event) => setFormValue("selfArgsText", event.target.value)}
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field__label">Roll limit</span>
              <select
                className="field__input"
                value={form.rollLimitMode}
                onChange={(event) =>
                  setFormValue(
                    "rollLimitMode",
                    event.target.value as FunMeterRollLimitMode,
                  )
                }
                disabled={saving}
              >
                <option value="daily">Раз на добу</option>
                <option value="none">Без обмежень</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">
                Шанс на збільшення: {Math.round(form.increaseChance * 100)}%
              </span>
              <input
                type="range"
                className="field__input"
                min={0}
                max={100}
                step={5}
                value={Math.round(form.increaseChance * 100)}
                onChange={(event) =>
                  setFormValue("increaseChance", Number(event.target.value) / 100)
                }
                disabled={saving}
              />
              <span className="field__hint">
                0% — завжди зменшує · 50% — рівний шанс · 100% — завжди збільшує (дефолт: 60%)
              </span>
            </label>

            <div className="form form--inline">
              <label className="field">
                <span className="field__label">Min roll</span>
                <input
                  className="field__input"
                  type="number"
                  min={1}
                  value={form.minRoll}
                  onChange={(event) =>
                    setFormValue("minRoll", Number(event.target.value) || 1)
                  }
                  disabled={saving}
                />
              </label>

              <label className="field">
                <span className="field__label">Max roll</span>
                <input
                  className="field__input"
                  type="number"
                  min={1}
                  value={form.maxRoll}
                  onChange={(event) =>
                    setFormValue("maxRoll", Number(event.target.value) || 1)
                  }
                  disabled={saving}
                />
              </label>
            </div>

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setFormValue("enabled", event.target.checked)}
                disabled={saving}
              />
              <span>Увімкнено</span>
            </label>
              </>
            ) : null}

            {activeTab === "jokes" ? (
            <div className="command-ref__group">
              <h3 className="command-ref__group-title">Жарти (по одному в рядку)</h3>

              {jokeBuckets.map((bucket) => (
                <label className="field" key={bucket.key}>
                  <span className="field__label">{bucket.label}</span>
                  <textarea
                    className="field__input field__input--textarea"
                    value={form.jokes[bucket.key].join("\n")}
                    onChange={(event) =>
                      setJokeValue(bucket.key, event.target.value)
                    }
                    disabled={saving}
                    rows={3}
                  />
                </label>
              ))}
            </div>
            ) : null}

            {activeTab === "messages" ? (
            <div className="command-ref__group">
              <h3 className="command-ref__group-title">Повідомлення</h3>

              {funMeterMessageFields.map((meta) => (
                <label className="field" key={meta.key}>
                  <span className="field__label">{meta.label}</span>
                  <textarea
                    className="field__input field__input--textarea"
                    value={form.messages[meta.key]}
                    onChange={(event) =>
                      setMessageValue(meta.key, event.target.value)
                    }
                    disabled={saving}
                    rows={2}
                  />
                  {meta.hint ? (
                    <span className="field__hint">{meta.hint}</span>
                  ) : null}
                </label>
              ))}
            </div>
            ) : null}

            <div className="form__footer">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingKey ? "Оновити" : "Створити"}
              </button>

              {editingKey ? (
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

        <div className="page">
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Fun meters</h2>
                <p className="card__subtitle">Створені internal mapped features</p>
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
                    Створити
                  </button>
                </div>
              ) : null}
            </div>

            {loading ? <div className="state-block">Завантаження...</div> : null}
            {error ? <div className="state-block state-block--error">{error}</div> : null}

            <div className="events-list">
              {features.map((feature) => (
                <article
                  className="event-card"
                  key={feature.key}
                  onClick={() => setSelectedKey(feature.key)}
                >
                  <div className="event-card__top">
                    <div>
                      <strong>{feature.title}</strong>
                      <span className="table-muted">{feature.key}</span>
                      <span className="table-muted">
                        {feature.rollLimitMode === "daily"
                          ? "раз на добу"
                          : "без обмежень"}
                      </span>
                    </div>
                    <span
                      className={`badge ${
                        feature.enabled ? "badge--success" : "badge--warning"
                      }`}
                    >
                      {feature.enabled ? "on" : "off"}
                    </span>
                  </div>

                  <div className="command-card__meta">
                    {feature.aliases.map((alias) => (
                      <span className="badge badge--muted" key={alias}>
                        !{alias}
                      </span>
                    ))}
                  </div>

                  <div className="actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedKey(feature.key);
                        startEdit(feature);
                      }}
                    >
                      Редагувати
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">
                  {selectedFeature ? selectedFeature.title : "Leaderboard"}
                </h2>
                <p className="card__subtitle">
                  {selectedFeature
                    ? `Internal fun feature: ${selectedFeature.key}`
                    : "Оберіть meter"}
                </p>
              </div>

              <div className="actions">
                <span className="badge badge--muted">
                  топ: {topScore} {selectedFeature?.unit ?? ""}
                </span>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void handleTestRoll()}
                  disabled={rolling || !selectedFeature}
                >
                  {rolling ? "Тест..." : "Test roll"}
                </button>
              </div>
            </div>

            {lastRoll && lastRoll.featureKey === selectedKey ? (
              <div className="state-block">{lastRoll.chatMessage}</div>
            ) : null}

            {viewers.length === 0 ? (
              <div className="state-block">Поки немає вимірів</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>rank</th>
                      <th>viewer</th>
                      <th>score</th>
                      <th>rollsCount</th>
                      <th>lastDelta</th>
                      <th>updatedAt</th>
                      <th>actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewers.map((viewer) => (
                      <tr key={viewer.id}>
                        <td>#{viewer.rank}</td>
                        <td>
                          <strong>{viewer.displayName || viewer.userLogin}</strong>
                          <span className="table-muted">@{viewer.userLogin}</span>
                        </td>
                        <td>
                          {viewer.score} {selectedFeature?.unit ?? ""}
                        </td>
                        <td>{viewer.rollsCount}</td>
                        <td>{formatDelta(viewer.lastDelta)}</td>
                        <td>{formatDateTime(viewer.updatedAt)}</td>
                        <td>
                          <button
                            className="button button--danger"
                            type="button"
                            onClick={() => void handleDeleteViewer(viewer)}
                            disabled={deletingUserId === viewer.twitchUserId}
                          >
                            {deletingUserId === viewer.twitchUserId
                              ? "Видалення..."
                              : "Видалити"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setMessageValue(key: keyof FunMeterMessages, value: string) {
    setForm((current) => ({
      ...current,
      messages: { ...current.messages, [key]: value },
    }));
  }

  function setJokeValue(key: FunMeterJokeBucketKey, value: string) {
    setForm((current) => ({
      ...current,
      jokes: { ...current.jokes, [key]: value.split("\n") },
    }));
  }
}

function cleanJokes(jokes: FunMeterJokes): FunMeterJokes {
  const result = {} as FunMeterJokes;

  for (const bucket of jokeBuckets) {
    result[bucket.key] = (jokes[bucket.key] ?? [])
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return result;
}

function formToDto(form: FormState): SaveFunMeterFeatureDto {
  return {
    key: form.key,
    title: form.title,
    unit: form.unit,
    enabled: form.enabled,
    aliases: parseCsv(form.aliasesText),
    leaderboardArgs: parseCsv(form.leaderboardArgsText),
    selfArgs: parseCsv(form.selfArgsText),
    rollLimitMode: form.rollLimitMode,
    increaseChance: form.increaseChance,
    minRoll: form.minRoll,
    maxRoll: form.maxRoll,
    jokes: cleanJokes(form.jokes),
    messages: form.messages,
  };
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDelta(value: number | null) {
  if (value === null) {
    return "—";
  }

  return value > 0 ? `+${value}` : String(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
