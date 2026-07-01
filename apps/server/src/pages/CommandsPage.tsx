import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCustomCommand,
  deleteCustomCommand,
  getCustomCommands,
  updateCustomCommand,
} from "../api/commands";
import { subscribeToTwitchRealtime } from "../api/realtime";
import type {
  CreateCustomCommandDto,
  CustomCommand,
  ReplyMode,
} from "../types/commands";

const initialForm: CreateCustomCommandDto = {
  name: "",
  responseText: "",
  enabled: true,
  cooldownMs: 5000,
  replyMode: "reply",
};

export function CommandsPage() {
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<CreateCustomCommandDto>(initialForm);

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

    const unsubscribe = subscribeToTwitchRealtime({
      onSnapshot: (snapshot) => {
        setCommands(Array.isArray(snapshot.commands) ? snapshot.commands : []);
        setLoading(false);
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
  }

  function startEdit(command: CustomCommand) {
    setEditingName(command.name);
    setForm({
      name: command.name,
      responseText: command.responseText,
      enabled: command.enabled,
      cooldownMs: command.cooldownMs,
      replyMode: command.replyMode,
    });
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);

    try {
      if (editingName) {
        await updateCustomCommand(editingName, form);
      } else {
        await createCustomCommand(form);
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
      <div className="page-columns page-columns--align-start">
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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="ping"
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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    responseText: event.target.value,
                  }))
                }
                placeholder="@{user} pong"
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
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    cooldownMs: Number(event.target.value) || 0,
                  }))
                }
                disabled={saving}
              />
            </label>

            <label className="field">
              <span className="field__label">Режим відповіді</span>
              <select
                className="field__input"
                value={form.replyMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    replyMode: event.target.value as ReplyMode,
                  }))
                }
                disabled={saving}
              >
                <option value="reply">reply</option>
                <option value="say">say</option>
              </select>
            </label>

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
                disabled={saving}
              />
              <span>Увімкнено</span>
            </label>

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

        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Команди</h2>
              <p className="card__subtitle">Поточний список кастомних команд</p>
            </div>
          </div>

          {loading ? <div className="state-block">Завантаження...</div> : null}
          {error ? <div className="state-block state-block--error">{error}</div> : null}

          {!loading && !error && sortedCommands.length === 0 ? (
            <div className="state-block">Команд поки немає</div>
          ) : null}

          {!loading && !error && sortedCommands.length > 0 ? (
            <div className="events-list">
              {sortedCommands.map((command) => (
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
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
