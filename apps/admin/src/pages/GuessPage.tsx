import { useEffect, useState, type FormEvent } from "react";
import {
  getGuessGameSettings,
  updateGuessGameSettings,
} from "../api/guess";
import type { GuessGameMessages, GuessGameSettings } from "../types/guess";

type TabId = "settings" | "messages";

type FormState = {
  command: string;
  stopCommand: string;
  reward: number;
  maxRange: number;
  maxDurationSeconds: number;
  messages: GuessGameMessages;
};

type MessageFieldMeta = {
  key: keyof GuessGameMessages;
  label: string;
  hint?: string;
};

const messageFields: MessageFieldMeta[] = [
  {
    key: "start",
    label: "Старт (без таймера)",
    hint: "{min}, {max}, {reward}, {unit}",
  },
  {
    key: "startTimed",
    label: "Старт (з таймером)",
    hint: "{min}, {max}, {reward}, {unit}, {seconds}",
  },
  {
    key: "win",
    label: "Перемога",
    hint: "{displayName}, {secret}, {reward}, {unit}, {balance}",
  },
  { key: "timeout", label: "Час вийшов", hint: "{secret}" },
  { key: "stopped", label: "Гру зупинено", hint: "{secret}" },
  { key: "alreadyRunning", label: "Вже триває", hint: "{displayName}" },
  { key: "notAllowed", label: "Немає прав", hint: "{displayName}" },
  {
    key: "invalidRange",
    label: "Невірний діапазон",
    hint: "{displayName}, {command}",
  },
  { key: "rangeTooBig", label: "Діапазон завеликий", hint: "{displayName}, {maxRange}" },
  { key: "noActiveGame", label: "Немає активної гри", hint: "{displayName}" },
];

function settingsToForm(settings: GuessGameSettings): FormState {
  return {
    command: settings.command,
    stopCommand: settings.stopCommand,
    reward: settings.reward,
    maxRange: settings.maxRange,
    maxDurationSeconds: settings.maxDurationSeconds,
    messages: settings.messages,
  };
}

export function GuessPage() {
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function loadSettings() {
    try {
      setForm(settingsToForm(await getGuessGameSettings()));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося завантажити налаштування",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
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
      const updated = await updateGuessGameSettings({
        command: form.command,
        stopCommand: form.stopCommand,
        reward: form.reward,
        maxRange: form.maxRange,
        maxDurationSeconds: form.maxDurationSeconds,
        messages: form.messages,
      });

      setForm(settingsToForm(updated));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function setMessageValue(key: keyof GuessGameMessages, value: string) {
    setForm((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Вгадай число</h2>
            <p className="card__subtitle">
              Команда !{form?.command ?? "цифри"} &lt;від&gt; &lt;до&gt; [час_с] —
              бот загадує число, перший хто вгадає у чаті отримує нагороду
            </p>
          </div>
        </div>

        {loading ? <div className="state-block">Завантаження...</div> : null}
        {error ? <div className="state-block state-block--error">{error}</div> : null}

        {form ? (
          <>
            <div className="tabs__nav" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "settings"}
                className={
                  activeTab === "settings"
                    ? "tab-button tab-button--active"
                    : "tab-button"
                }
                onClick={() => setActiveTab("settings")}
              >
                Налаштування
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "messages"}
                className={
                  activeTab === "messages"
                    ? "tab-button tab-button--active"
                    : "tab-button"
                }
                onClick={() => setActiveTab("messages")}
              >
                Повідомлення
              </button>
            </div>

            <form className="form" onSubmit={handleSave}>
              {activeTab === "settings" ? (
                <>
                  <div className="form form--inline">
                    <label className="field">
                      <span className="field__label">Команда старту</span>
                      <input
                        className="field__input"
                        value={form.command}
                        onChange={(event) => setFormValue("command", event.target.value)}
                        disabled={saving}
                        required
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Команда зупинки</span>
                      <input
                        className="field__input"
                        value={form.stopCommand}
                        onChange={(event) =>
                          setFormValue("stopCommand", event.target.value)
                        }
                        disabled={saving}
                        required
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Нагорода за перемогу</span>
                      <input
                        className="field__input"
                        type="number"
                        min={1}
                        value={form.reward}
                        onChange={(event) =>
                          setFormValue("reward", Number(event.target.value) || 1)
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>

                  <div className="form form--inline">
                    <label className="field">
                      <span className="field__label">Макс. розмір діапазону</span>
                      <input
                        className="field__input"
                        type="number"
                        min={1}
                        value={form.maxRange}
                        onChange={(event) =>
                          setFormValue("maxRange", Number(event.target.value) || 1)
                        }
                        disabled={saving}
                      />
                      <span className="field__hint">
                        максимум (до − від), щоб уникнути величезних діапазонів
                      </span>
                    </label>

                    <label className="field">
                      <span className="field__label">Макс. таймер (с)</span>
                      <input
                        className="field__input"
                        type="number"
                        min={1}
                        value={form.maxDurationSeconds}
                        onChange={(event) =>
                          setFormValue(
                            "maxDurationSeconds",
                            Number(event.target.value) || 1,
                          )
                        }
                        disabled={saving}
                      />
                      <span className="field__hint">
                        стеля для необов'язкового таймера в команді старту
                      </span>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
