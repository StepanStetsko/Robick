import { useEffect, useState, type FormEvent } from "react";
import {
  getGiveawaySettings,
  updateGiveawaySettings,
} from "../api/giveaway";
import type {
  GiveawayMessages,
  GiveawayPreset,
  GiveawaySettings,
} from "../types/giveaway";

type TabId = "settings" | "messages";

type FormState = {
  joinKeyword: string;
  selfCommand: string;
  maxAmount: number;
  durationSeconds: number;
  reminderMinSeconds: number;
  reminderMaxSeconds: number;
  presets: GiveawayPreset[];
  messages: GiveawayMessages;
};

const newPreset: GiveawayPreset = {
  commandName: "розіграш",
  winnersMode: "dynamic",
  fixedWinners: 1,
  minWinners: 1,
  maxWinners: 10,
  participantsForMax: 100,
  enabled: true,
};

type MessageFieldMeta = {
  key: keyof GiveawayMessages;
  label: string;
  hint?: string;
};

const messageFields: MessageFieldMeta[] = [
  {
    key: "start",
    label: "Старт розіграшу",
    hint: "{amount}, {unit}, {joinKeyword}, {seconds}",
  },
  {
    key: "reminder",
    label: "Нагадування",
    hint: "{amount}, {unit}, {secondsLeft}, {participantsCount}, {joinKeyword}",
  },
  {
    key: "winners",
    label: "Переможці",
    hint: "{amount}, {unit}, {winners}, {perWinner}",
  },
  { key: "noParticipants", label: "Немає учасників" },
  { key: "alreadyRunning", label: "Вже триває", hint: "{displayName}" },
  { key: "notAllowed", label: "Немає прав", hint: "{displayName}" },
  {
    key: "invalidAmount",
    label: "Невірна сума",
    hint: "{displayName}, {commandName}",
  },
  {
    key: "selfStart",
    label: "Старт (свої бали)",
    hint: "{displayName}, {amount}, {unit}, {joinKeyword}, {seconds}",
  },
  {
    key: "selfInsufficient",
    label: "Замало своїх балів",
    hint: "{displayName}, {amount}, {balance}, {unit}",
  },
  {
    key: "selfRefunded",
    label: "Повернення (немає учасників)",
    hint: "{displayName}, {amount}, {unit}",
  },
];

function settingsToForm(settings: GiveawaySettings): FormState {
  return {
    joinKeyword: settings.joinKeyword,
    selfCommand: settings.selfCommand,
    maxAmount: settings.maxAmount,
    durationSeconds: settings.durationSeconds,
    reminderMinSeconds: settings.reminderMinSeconds,
    reminderMaxSeconds: settings.reminderMaxSeconds,
    presets: settings.presets,
    messages: settings.messages,
  };
}

export function GiveawayPage() {
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function loadSettings() {
    try {
      setForm(settingsToForm(await getGiveawaySettings()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити налаштування");
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
      const updated = await updateGiveawaySettings({
        joinKeyword: form.joinKeyword,
        selfCommand: form.selfCommand,
        maxAmount: form.maxAmount,
        durationSeconds: form.durationSeconds,
        reminderMinSeconds: form.reminderMinSeconds,
        reminderMaxSeconds: form.reminderMaxSeconds,
        presets: form.presets,
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

  function setMessageValue(key: keyof GiveawayMessages, value: string) {
    setForm((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  function updatePreset<K extends keyof GiveawayPreset>(
    index: number,
    key: K,
    value: GiveawayPreset[K],
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            presets: current.presets.map((preset, i) =>
              i === index ? { ...preset, [key]: value } : preset,
            ),
          }
        : current,
    );
  }

  function addPreset() {
    setForm((current) =>
      current
        ? { ...current, presets: [...current.presets, { ...newPreset }] }
        : current,
    );
  }

  function removePreset(index: number) {
    setForm((current) =>
      current
        ? { ...current, presets: current.presets.filter((_, i) => i !== index) }
        : current,
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Розіграш</h2>
            <p className="card__subtitle">
              Команди-пресети, ключове слово участі, час і повідомлення
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
                      <span className="field__label">Слово участі</span>
                      <input
                        className="field__input"
                        value={form.joinKeyword}
                        onChange={(event) => setFormValue("joinKeyword", event.target.value)}
                        disabled={saving}
                        required
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Команда «розіграш своїх»</span>
                      <input
                        className="field__input"
                        value={form.selfCommand}
                        onChange={(event) => setFormValue("selfCommand", event.target.value)}
                        disabled={saving}
                        required
                      />
                      <span className="field__hint">
                        !{form.selfCommand} 500 — розіграти власні бали (списуються)
                      </span>
                    </label>

                    <label className="field">
                      <span className="field__label">Макс. сума</span>
                      <input
                        className="field__input"
                        type="number"
                        min={1}
                        value={form.maxAmount}
                        onChange={(event) =>
                          setFormValue("maxAmount", Number(event.target.value) || 1)
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>

                  <div className="form form--inline">
                    <label className="field">
                      <span className="field__label">Тривалість (с)</span>
                      <input
                        className="field__input"
                        type="number"
                        min={5}
                        value={form.durationSeconds}
                        onChange={(event) =>
                          setFormValue("durationSeconds", Number(event.target.value) || 5)
                        }
                        disabled={saving}
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Нагадування мін (с)</span>
                      <input
                        className="field__input"
                        type="number"
                        min={1}
                        value={form.reminderMinSeconds}
                        onChange={(event) =>
                          setFormValue("reminderMinSeconds", Number(event.target.value) || 1)
                        }
                        disabled={saving}
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Нагадування макс (с)</span>
                      <input
                        className="field__input"
                        type="number"
                        min={1}
                        value={form.reminderMaxSeconds}
                        onChange={(event) =>
                          setFormValue("reminderMaxSeconds", Number(event.target.value) || 1)
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>

                  <div className="command-ref__group">
                    <h3 className="command-ref__group-title">Команди-пресети</h3>

                    {form.presets.map((preset, index) => (
                      <div className="card card--nested" key={index}>
                        <div className="form form--inline">
                          <label className="field">
                            <span className="field__label">Назва команди</span>
                            <input
                              className="field__input"
                              value={preset.commandName}
                              onChange={(event) =>
                                updatePreset(index, "commandName", event.target.value)
                              }
                              disabled={saving}
                            />
                            <span className="field__hint">без знака !</span>
                          </label>

                          <label className="field">
                            <span className="field__label">Режим</span>
                            <select
                              className="field__input"
                              value={preset.winnersMode}
                              onChange={(event) =>
                                updatePreset(
                                  index,
                                  "winnersMode",
                                  event.target.value as GiveawayPreset["winnersMode"],
                                )
                              }
                              disabled={saving}
                            >
                              <option value="dynamic">Динамічно (від к-ті учасників)</option>
                              <option value="fixed">Фіксовано</option>
                            </select>
                          </label>
                        </div>

                        <div className="form form--inline">
                          {preset.winnersMode === "fixed" ? (
                            <label className="field">
                              <span className="field__label">К-ть переможців</span>
                              <input
                                className="field__input"
                                type="number"
                                min={1}
                                value={preset.fixedWinners}
                                onChange={(event) =>
                                  updatePreset(
                                    index,
                                    "fixedWinners",
                                    Number(event.target.value) || 1,
                                  )
                                }
                                disabled={saving}
                              />
                            </label>
                          ) : (
                            <>
                              <label className="field">
                                <span className="field__label">Мін переможців</span>
                                <input
                                  className="field__input"
                                  type="number"
                                  min={1}
                                  value={preset.minWinners}
                                  onChange={(event) =>
                                    updatePreset(
                                      index,
                                      "minWinners",
                                      Number(event.target.value) || 1,
                                    )
                                  }
                                  disabled={saving}
                                />
                              </label>

                              <label className="field">
                                <span className="field__label">Макс переможців</span>
                                <input
                                  className="field__input"
                                  type="number"
                                  min={1}
                                  value={preset.maxWinners}
                                  onChange={(event) =>
                                    updatePreset(
                                      index,
                                      "maxWinners",
                                      Number(event.target.value) || 1,
                                    )
                                  }
                                  disabled={saving}
                                />
                              </label>

                              <label className="field">
                                <span className="field__label">Учасників на макс</span>
                                <input
                                  className="field__input"
                                  type="number"
                                  min={1}
                                  value={preset.participantsForMax}
                                  onChange={(event) =>
                                    updatePreset(
                                      index,
                                      "participantsForMax",
                                      Number(event.target.value) || 1,
                                    )
                                  }
                                  disabled={saving}
                                />
                              </label>
                            </>
                          )}
                        </div>

                        <div className="actions">
                          <label className="field field--checkbox">
                            <input
                              type="checkbox"
                              checked={preset.enabled}
                              onChange={(event) =>
                                updatePreset(index, "enabled", event.target.checked)
                              }
                              disabled={saving}
                            />
                            <span>Увімкнено</span>
                          </label>

                          <button
                            className="button button--ghost"
                            type="button"
                            onClick={() => removePreset(index)}
                            disabled={saving}
                          >
                            Видалити
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="actions">
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={addPreset}
                        disabled={saving}
                      >
                        Додати пресет
                      </button>
                    </div>
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
