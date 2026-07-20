import { useEffect, useState, type FormEvent } from "react";
import {
  addSong,
  addSongBlock,
  clearSongQueue,
  getSongBlocklist,
  getSongHistory,
  getSongQueue,
  getSongRequestSettings,
  playPreviousSong,
  removeSong,
  removeSongBlock,
  skipCurrentSong,
  togglePauseSong,
  updateSongRequestSettings,
} from "../api/songRequest";
import { subscribeToTwitchRealtime } from "../api/realtime";
import { NowPlayingCard } from "../components/NowPlayingCard";
import type {
  SongBlockEntry,
  SongQueueState,
  SongRequestEntry,
  SongRequestMessages,
  SongRequestSettings,
} from "../types/songRequest";

type TabId = "queue" | "history" | "blocklist" | "settings" | "messages";

type FormState = {
  command: string;
  enabled: boolean;
  maxQueuePerUser: number;
  maxDurationSec: number;
  perUserCooldownSec: number;
  voteSkipCommand: string;
  pauseCommand: string;
  skipVotesNeeded: number;
  historyLimit: number;
  messages: SongRequestMessages;
};

const messageFields: { key: keyof SongRequestMessages; label: string; hint?: string }[] = [
  { key: "added", label: "Додано в чергу", hint: "{displayName}, {title}, {position}, {command}" },
  { key: "queueFull", label: "Черга заповнена (ліміт юзера)", hint: "{displayName}, {max}" },
  { key: "cooldown", label: "Кулдаун", hint: "{displayName}, {secondsLeft}" },
  { key: "invalidUrl", label: "Невірне посилання", hint: "{displayName}, {command}" },
  { key: "disabled", label: "Вимкнено", hint: "{displayName}" },
  { key: "duplicate", label: "Дублікат у черзі", hint: "{displayName}" },
  { key: "blocked", label: "Заборонена пісня", hint: "{displayName}" },
  { key: "tooLong", label: "Пісня задовга", hint: "{displayName}, {durationMin}, {maxMin}, {durationSec}, {maxSec}" },
  { key: "voteProgress", label: "Голос за пропуск", hint: "{displayName}, {votes}, {needed}, {left}" },
  { key: "voteAlready", label: "Уже голосував", hint: "{displayName}, {votes}, {needed}" },
  { key: "voteSkipped", label: "Пропущено голосуванням", hint: "{votes}, {needed}" },
  { key: "modSkipped", label: "Мод пропустив", hint: "{displayName}" },
  { key: "paused", label: "Пауза", hint: "{displayName}" },
  { key: "resumed", label: "Відновлено", hint: "{displayName}" },
  { key: "nothingPlaying", label: "Нічого не грає", hint: "{displayName}" },
];

function settingsToForm(settings: SongRequestSettings): FormState {
  return {
    command: settings.command,
    enabled: settings.enabled,
    maxQueuePerUser: settings.maxQueuePerUser,
    maxDurationSec: settings.maxDurationSec,
    perUserCooldownSec: settings.perUserCooldownSec,
    voteSkipCommand: settings.voteSkipCommand,
    pauseCommand: settings.pauseCommand,
    skipVotesNeeded: settings.skipVotesNeeded,
    historyLimit: settings.historyLimit,
    messages: settings.messages,
  };
}

export function SongRequestPage() {
  const [activeTab, setActiveTab] = useState<TabId>("queue");
  const [form, setForm] = useState<FormState | null>(null);
  const [state, setState] = useState<SongQueueState>({
    current: null,
    queue: [],
    paused: false,
    skipVotes: 0,
    skipVotesNeeded: 5,
  });
  const [addUrl, setAddUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState<"overlay" | "page" | null>(null);
  const [history, setHistory] = useState<SongRequestEntry[]>([]);
  const [blocklist, setBlocklist] = useState<SongBlockEntry[]>([]);
  const [blockUrl, setBlockUrl] = useState("");

  const overlayUrl = `${window.location.origin}/overlay/player`;
  const publicPageUrl = `${window.location.origin}/songs`;

  async function copyUrl(which: "overlay" | "page", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard unavailable — user can still copy manually
    }
  }

  async function loadHistory() {
    try {
      setHistory(await getSongHistory());
    } catch {
      // non-critical — history stays as-is
    }
  }

  async function loadBlocklist() {
    try {
      setBlocklist(await getSongBlocklist());
    } catch {
      // non-critical — blocklist stays as-is
    }
  }

  async function load() {
    try {
      const [settings, queue] = await Promise.all([
        getSongRequestSettings(),
        getSongQueue(),
      ]);
      setForm(settingsToForm(settings));
      setState(queue);
      void loadHistory();
      void loadBlocklist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await addSongBlock(blockUrl.trim());
      setBlockUrl("");
      await loadBlocklist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося заблокувати");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveBlock(id: string) {
    setBusy(true);
    setError(null);

    try {
      setBlocklist(await removeSongBlock(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося прибрати");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();

    const unsubscribe = subscribeToTwitchRealtime({
      onSongQueueChanged: (data) => {
        setState(data);
        // A track change usually means something moved into history.
        void loadHistory();
      },
    });

    return () => unsubscribe();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) {
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setSavedAt(null);

    try {
      const updated = await updateSongRequestSettings(form);
      setForm(settingsToForm(updated));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await addSong(addUrl.trim());
      setAddUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати пісню");
    } finally {
      setBusy(false);
    }
  }

  async function runQueueAction(action: () => Promise<SongQueueState>) {
    setBusy(true);
    setError(null);

    try {
      setState(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function readdSong(url: string) {
    setBusy(true);
    setError(null);

    try {
      await addSong(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати пісню");
    } finally {
      setBusy(false);
    }
  }

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function setMessageValue(key: keyof SongRequestMessages, value: string) {
    setForm((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  function renderRow(entry: SongRequestEntry, position: number) {
    return (
      <tr key={entry.id}>
        <td>#{position}</td>
        <td>
          <strong>{entry.title || entry.videoId}</strong>
          <span className="table-muted">{entry.url}</span>
        </td>
        <td>{entry.requestedBy}</td>
        <td>
          {entry.priority > 0 ? (
            <span className="badge badge--warning">донат</span>
          ) : (
            <span className="badge badge--muted">{entry.source}</span>
          )}
        </td>
        <td>
          <button
            className="button button--danger button--small"
            type="button"
            onClick={() => void runQueueAction(() => removeSong(entry.id))}
            disabled={busy}
          >
            Видалити
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Замовлення пісень</h2>
            <p className="card__subtitle">
              Глядачі замовляють пісні через !{form?.command ?? "пісня"} &lt;youtube&gt;;
              грають по черзі в OBS-віджеті (див. вкладку «Черга»).
            </p>
          </div>
        </div>

        <div className="tabs__nav" role="tablist">
          {([
            ["queue", "Черга"],
            ["history", "Історія"],
            ["blocklist", "Блок-лист"],
            ["settings", "Налаштування"],
            ["messages", "Повідомлення"],
          ] as [TabId, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={
                activeTab === id ? "tab-button tab-button--active" : "tab-button"
              }
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? <div className="state-block">Завантаження...</div> : null}
        {error ? <div className="state-block state-block--error">{error}</div> : null}

        {activeTab === "queue" ? (
          <>
            <form className="form form--inline" onSubmit={handleAdd}>
              <label className="field">
                <span className="field__label">Додати пісню вручну</span>
                <input
                  className="field__input"
                  value={addUrl}
                  onChange={(event) => setAddUrl(event.target.value)}
                  placeholder="https://youtu.be/..."
                  disabled={busy}
                />
              </label>
              <div className="actions">
                <button className="button button--primary" type="submit" disabled={busy}>
                  Додати
                </button>
              </div>
            </form>

            <div className="actions" style={{ marginTop: 16 }}>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void runQueueAction(playPreviousSong)}
                disabled={busy || history.length === 0}
                title="Повернути попередню пісню (поточна піде в чергу)"
              >
                ⏮ Попередня
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void runQueueAction(togglePauseSong)}
                disabled={busy || !state.current}
              >
                {state.paused ? "▶ Відновити" : "⏸ Пауза"}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void runQueueAction(skipCurrentSong)}
                disabled={busy}
              >
                Пропустити поточну
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  if (window.confirm("Очистити всю чергу?")) {
                    void runQueueAction(clearSongQueue);
                  }
                }}
                disabled={busy}
              >
                Очистити чергу
              </button>
            </div>

            <div className="command-ref__group">
              <h3 className="command-ref__group-title">Віджет для OBS</h3>
              <p className="tab-panel__intro">
                Мінімалістичний аудіо-плеєр із плашкою «зараз грає». Додай як{" "}
                <strong>Browser Source</strong> в OBS — відео сховане, грає лише
                звук.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <code>{overlayUrl}</code>
                <button
                  className="button button--ghost button--small"
                  type="button"
                  onClick={() => void copyUrl("overlay", overlayUrl)}
                >
                  {copied === "overlay" ? "Скопійовано ✓" : "Копіювати адресу"}
                </button>
              </div>

              <p className="tab-panel__intro">
                Публічна сторінка черги для глядачів (тільки перегляд —
                замовляють у чаті) — можна кинути в опис стріму:
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <code>{publicPageUrl}</code>
                <button
                  className="button button--ghost button--small"
                  type="button"
                  onClick={() => void copyUrl("page", publicPageUrl)}
                >
                  {copied === "page" ? "Скопійовано ✓" : "Копіювати адресу"}
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: 24,
                  borderRadius: 12,
                  background:
                    "repeating-conic-gradient(#0c0e14 0% 25%, #10131b 0% 50%) 50% / 24px 24px",
                }}
              >
                <NowPlayingCard
                  title={state.current?.title ?? null}
                  thumbnailUrl={state.current?.thumbnailUrl ?? null}
                  requestedBy={state.current?.requestedBy ?? null}
                  progress={0.4}
                  idle={!state.current}
                  paused={state.paused}
                  skipVotes={state.skipVotes}
                  skipNeeded={state.skipVotesNeeded}
                />
              </div>
            </div>

            <div className="command-ref__group">
              <h3 className="command-ref__group-title">Зараз грає</h3>
              {state.current ? (
                <div className="state-block">
                  <strong>{state.current.title || state.current.videoId}</strong>
                  <span className="table-muted">
                    від {state.current.requestedBy} · {state.current.url}
                  </span>
                  <span className="table-muted">
                    {state.paused ? "⏸ на паузі" : "▶ грає"}
                    {state.skipVotes > 0
                      ? ` · голосів за пропуск: ${state.skipVotes}/${state.skipVotesNeeded}`
                      : ""}
                  </span>
                </div>
              ) : (
                <div className="state-block">Нічого не грає</div>
              )}
            </div>

            <div className="command-ref__group">
              <h3 className="command-ref__group-title">Черга ({state.queue.length})</h3>
              {state.queue.length === 0 ? (
                <div className="state-block">Черга порожня</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>пісня</th>
                        <th>замовив</th>
                        <th>тип</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.queue.map((entry, index) => renderRow(entry, index + 1))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        {activeTab === "history" ? (
          <div className="command-ref__group">
            <h3 className="command-ref__group-title">
              Історія ({history.length})
            </h3>
            <p className="tab-panel__intro">
              Нещодавно зіграні та пропущені пісні. «↻ У чергу» — додати знову.
            </p>
            {history.length === 0 ? (
              <div className="state-block">Ще нічого не грало</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>пісня</th>
                      <th>замовив</th>
                      <th>статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.title || entry.videoId}</strong>
                          <span className="table-muted">{entry.url}</span>
                        </td>
                        <td>{entry.requestedBy}</td>
                        <td>
                          {entry.status === "skipped" ? (
                            <span className="badge badge--warning">пропущено</span>
                          ) : (
                            <span className="badge badge--muted">зіграно</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="button button--ghost button--small"
                            type="button"
                            onClick={() => void readdSong(entry.url)}
                            disabled={busy}
                            title="Додати цю пісню знову в чергу"
                          >
                            ↻ У чергу
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "blocklist" ? (
          <div className="command-ref__group">
            <h3 className="command-ref__group-title">
              Блок-лист ({blocklist.length})
            </h3>
            <p className="tab-panel__intro">
              Заборонені пісні — їх не можна замовити ні в чаті, ні на сайті.
              Якщо заборонена пісня вже в черзі, вона одразу прибирається.
            </p>

            <form className="form form--inline" onSubmit={handleAddBlock}>
              <label className="field" style={{ flex: 2 }}>
                <span className="field__label">
                  Заблокувати пісню (YouTube URL)
                </span>
                <input
                  className="field__input"
                  value={blockUrl}
                  onChange={(event) => setBlockUrl(event.target.value)}
                  placeholder="https://youtu.be/..."
                  disabled={busy}
                />
              </label>
              <div className="actions">
                <button
                  className="button button--danger"
                  type="submit"
                  disabled={busy}
                >
                  Заблокувати
                </button>
              </div>
            </form>

            {blocklist.length === 0 ? (
              <div className="state-block">Блок-лист порожній</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>пісня</th>
                      <th>додав</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocklist.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.title || entry.videoId}</strong>
                          <span className="table-muted">{entry.url}</span>
                        </td>
                        <td>{entry.addedBy || "—"}</td>
                        <td>
                          <button
                            className="button button--ghost button--small"
                            type="button"
                            onClick={() => void handleRemoveBlock(entry.id)}
                            disabled={busy}
                          >
                            Прибрати
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {form && (activeTab === "settings" || activeTab === "messages") ? (
          <form className="form" onSubmit={handleSave}>
            {activeTab === "settings" ? (
              <>
                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => setFormValue("enabled", event.target.checked)}
                    disabled={saving}
                  />
                  <span>Замовлення пісень увімкнено</span>
                </label>

                <label className="field">
                  <span className="field__label">Команда замовлення</span>
                  <input
                    className="field__input"
                    value={form.command}
                    onChange={(event) => setFormValue("command", event.target.value)}
                    disabled={saving}
                    required
                  />
                </label>

                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Макс. пісень у черзі на юзера</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.maxQueuePerUser}
                      onChange={(event) =>
                        setFormValue("maxQueuePerUser", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">0 — без обмеження</span>
                  </label>

                  <label className="field">
                    <span className="field__label">Кулдаун на юзера (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.perUserCooldownSec}
                      onChange={(event) =>
                        setFormValue("perUserCooldownSec", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Макс. тривалість (с)</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.maxDurationSec}
                      onChange={(event) =>
                        setFormValue("maxDurationSec", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      0 — без ліміту. Тривалість тягнеться з YouTube (best-effort);
                      якщо не визначилась — пісня проходить.
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Розмір історії</span>
                    <input
                      className="field__input"
                      type="number"
                      min={0}
                      value={form.historyLimit}
                      onChange={(event) =>
                        setFormValue("historyLimit", Number(event.target.value) || 0)
                      }
                      disabled={saving}
                    />
                    <span className="field__hint">
                      скільки зіграних/пропущених пісень зберігати (деф. 20)
                    </span>
                  </label>
                </div>

                <h3 className="command-ref__group-title">Керування (скіп / пауза)</h3>
                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Команда голосу за пропуск</span>
                    <input
                      className="field__input"
                      value={form.voteSkipCommand}
                      onChange={(event) =>
                        setFormValue("voteSkipCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                    <span className="field__hint">
                      глядачі голосують, моди/стрімер — миттєвий скіп
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">Команда паузи (моди)</span>
                    <input
                      className="field__input"
                      value={form.pauseCommand}
                      onChange={(event) =>
                        setFormValue("pauseCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="field__label">Голосів для пропуску</span>
                    <input
                      className="field__input"
                      type="number"
                      min={1}
                      value={form.skipVotesNeeded}
                      onChange={(event) =>
                        setFormValue("skipVotesNeeded", Number(event.target.value) || 1)
                      }
                      disabled={saving}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {activeTab === "messages" ? (
              <div className="command-ref__group">
                <h3 className="command-ref__group-title">Повідомлення</h3>
                {messageFields.map((meta) => (
                  <label className="field" key={meta.key}>
                    <span className="field__label">{meta.label}</span>
                    <textarea
                      className="field__input field__input--textarea"
                      value={form.messages[meta.key]}
                      onChange={(event) => setMessageValue(meta.key, event.target.value)}
                      disabled={saving}
                      rows={2}
                    />
                    {meta.hint ? <span className="field__hint">{meta.hint}</span> : null}
                  </label>
                ))}
              </div>
            ) : null}

            <div className="form__footer">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Збереження..." : "Зберегти"}
              </button>
              {submitError ? (
                <span className="field__hint" style={{ color: "#ffb5b2" }}>
                  {submitError}
                </span>
              ) : savedAt ? (
                <span className="field__hint">Збережено о {savedAt}</span>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
