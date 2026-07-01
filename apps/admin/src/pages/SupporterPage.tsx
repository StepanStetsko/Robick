import { useEffect, useState, type FormEvent } from "react";
import {
  addSupporter,
  getSupporterSettings,
  getSupporters,
  removeSupporter,
  updateSupporterSettings,
} from "../api/supporter";
import type {
  SupporterMessages,
  SupporterSettings,
  SupporterStatusEntry,
  SupporterTier,
} from "../types/supporter";

type TabId = "tiers" | "subscribers" | "messages";

type FormState = {
  enabled: boolean;
  loyalStreakDays: number;
  streakResetOnMissedStream: boolean;
  loyalMultiplier: number;
  supporterMultiplier: number;
  bonusCommand: string;
  bonusCooldownSec: number;
  guestDailyBonus: number;
  loyalDailyBonus: number;
  supporterDailyBonus: number;
  guestStreakBonus: number;
  loyalStreakBonus: number;
  supporterStreakBonus: number;
  supporterSongPriority: number;
  messages: SupporterMessages;
};

const messageFields: {
  key: keyof SupporterMessages;
  label: string;
  hint?: string;
}[] = [
  {
    key: "bonusClaimed",
    label: "Бонус отримано",
    hint: "{displayName}, {amount}, {unit}, {tier}",
  },
  { key: "bonusCooldown", label: "Бонус на кулдауні", hint: "{displayName}, {timeLeft}" },
  { key: "bonusDisabled", label: "Бонус вимкнено", hint: "{displayName}" },
  { key: "loyalBadge", label: "Бейдж: Активний (loyal)" },
  { key: "supporterBadge", label: "Бейдж: Підписник (supporter)" },
  { key: "greetingLoyal", label: "Привітання: Активний", hint: "{displayName}" },
  { key: "greetingSupporter", label: "Привітання: Підписник", hint: "{displayName}" },
  { key: "tierGuest", label: "Назва рівня: Гість" },
  { key: "tierLoyal", label: "Назва рівня: Активний" },
  { key: "tierSupporter", label: "Назва рівня: Підписник" },
];

const tierBadge: Record<SupporterTier, { label: string; cls: string }> = {
  guest: { label: "Гість", cls: "badge badge--muted" },
  loyal: { label: "🔵 Активний", cls: "badge badge--success" },
  supporter: { label: "🟣 Підписник", cls: "badge badge--warning" },
};

function settingsToForm(settings: SupporterSettings): FormState {
  return {
    enabled: settings.enabled,
    loyalStreakDays: settings.loyalStreakDays,
    streakResetOnMissedStream: settings.streakResetOnMissedStream,
    loyalMultiplier: settings.loyalMultiplier,
    supporterMultiplier: settings.supporterMultiplier,
    bonusCommand: settings.bonusCommand,
    bonusCooldownSec: settings.bonusCooldownSec,
    guestDailyBonus: settings.guestDailyBonus,
    loyalDailyBonus: settings.loyalDailyBonus,
    supporterDailyBonus: settings.supporterDailyBonus,
    guestStreakBonus: settings.guestStreakBonus,
    loyalStreakBonus: settings.loyalStreakBonus,
    supporterStreakBonus: settings.supporterStreakBonus,
    supporterSongPriority: settings.supporterSongPriority,
    messages: settings.messages,
  };
}

export function SupporterPage() {
  const [activeTab, setActiveTab] = useState<TabId>("tiers");
  const [form, setForm] = useState<FormState | null>(null);
  const [subscribers, setSubscribers] = useState<SupporterStatusEntry[]>([]);
  const [newLogin, setNewLogin] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newUntil, setNewUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function load() {
    try {
      const [settings, list] = await Promise.all([
        getSupporterSettings(),
        getSupporters(),
      ]);
      setForm(settingsToForm(settings));
      setSubscribers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
      const updated = await updateSupporterSettings(form);
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
    const login = newLogin.trim();
    if (!login) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await addSupporter({
        userLogin: login,
        note: newNote.trim() || null,
        manualUntil: newUntil || null,
      });
      setNewLogin("");
      setNewNote("");
      setNewUntil("");
      setSubscribers(await getSupporters());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося додати");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(login: string) {
    if (!window.confirm(`Прибрати ${login} зі списку підписників?`)) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await removeSupporter(login);
      setSubscribers(await getSupporters());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити");
    } finally {
      setBusy(false);
    }
  }

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function setMessageValue(key: keyof SupporterMessages, value: string) {
    setForm((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  function numberField(
    key: keyof FormState,
    label: string,
    hint?: string,
    step?: number,
  ) {
    return (
      <label className="field" key={key}>
        <span className="field__label">{label}</span>
        <input
          className="field__input"
          type="number"
          min={0}
          step={step ?? 1}
          value={form ? (form[key] as number) : 0}
          onChange={(event) =>
            setFormValue(key, Number(event.target.value) || 0)
          }
          disabled={saving}
        />
        {hint ? <span className="field__hint">{hint}</span> : null}
      </label>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Перки та рівні</h2>
            <p className="card__subtitle">
              Рівні глядачів: <strong>Гість</strong> → <strong>Активний</strong>{" "}
              (безкоштовно, за стрік присутності) →{" "}
              <strong>Підписник</strong> (поки — ручний список; згодом mono).
              Кожен наступний рівень включає перки попереднього, лише сильніші.
            </p>
          </div>
        </div>

        <div className="tabs__nav" role="tablist">
          {([
            ["tiers", "Рівні"],
            ["subscribers", "Підписники"],
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
        {error ? (
          <div className="state-block state-block--error">{error}</div>
        ) : null}

        {activeTab === "subscribers" ? (
          <>
            <form className="form form--inline" onSubmit={handleAdd}>
              <label className="field">
                <span className="field__label">Twitch-логін</span>
                <input
                  className="field__input"
                  value={newLogin}
                  onChange={(event) => setNewLogin(event.target.value)}
                  placeholder="напр. robik_viewer"
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span className="field__label">Нотатка (необовʼязково)</span>
                <input
                  className="field__input"
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  placeholder="за що / хто"
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span className="field__label">Діє до (необовʼязково)</span>
                <input
                  className="field__input"
                  type="date"
                  value={newUntil}
                  onChange={(event) => setNewUntil(event.target.value)}
                  disabled={busy}
                />
                <span className="field__hint">порожньо — безстроково</span>
              </label>
              <div className="actions">
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={busy}
                >
                  Додати підписника
                </button>
              </div>
            </form>

            <div className="command-ref__group">
              <h3 className="command-ref__group-title">
                Ручний список підписників ({subscribers.length})
              </h3>
              {subscribers.length === 0 ? (
                <div className="state-block">
                  Поки порожньо. Додай логін вручну — пізніше mono-підписки
                  писатимуть сюди автоматично.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>логін</th>
                        <th>рівень</th>
                        <th>стрік</th>
                        <th>діє до</th>
                        <th>нотатка</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscribers.map((entry) => (
                        <tr key={entry.userLogin}>
                          <td>
                            <strong>{entry.userLogin}</strong>
                          </td>
                          <td>
                            <span className={tierBadge[entry.tier].cls}>
                              {tierBadge[entry.tier].label}
                            </span>
                          </td>
                          <td>{entry.streakDays} дн.</td>
                          <td>
                            {entry.manualUntil
                              ? new Date(entry.manualUntil).toLocaleDateString()
                              : "безстроково"}
                          </td>
                          <td>
                            <span className="table-muted">
                              {entry.note ?? ""}
                            </span>
                          </td>
                          <td>
                            <button
                              className="button button--danger button--small"
                              type="button"
                              onClick={() => void handleRemove(entry.userLogin)}
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
          </>
        ) : null}

        {form && activeTab !== "subscribers" ? (
          <form className="form" onSubmit={handleSave}>
            {activeTab === "tiers" ? (
              <>
                <label className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) =>
                      setFormValue("enabled", event.target.checked)
                    }
                    disabled={saving}
                  />
                  <span>Систему перків увімкнено</span>
                </label>

                <div className="tab-panel__intro">
                  Рівень «Активний» глядач отримує безкоштовно за{" "}
                  <strong>{form.loyalStreakDays}</strong> дн. присутності поспіль.
                  «Підписник» — з ручного списку (вкладка «Підписники»).
                </div>

                <div className="form form--inline">
                  {numberField("loyalStreakDays", "Днів стріку для «Активний»")}
                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={form.streakResetOnMissedStream}
                      onChange={(event) =>
                        setFormValue(
                          "streakResetOnMissedStream",
                          event.target.checked,
                        )
                      }
                      disabled={saving}
                    />
                    <span>Стрік згорає при пропуску стріму</span>
                  </label>
                </div>

                <h3 className="command-ref__group-title">Множник валюти</h3>
                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Гість</span>
                    <input
                      className="field__input"
                      value="×1.0 (базовий)"
                      disabled
                      readOnly
                    />
                  </label>
                  {numberField("loyalMultiplier", "Активний (×)", undefined, 0.1)}
                  {numberField(
                    "supporterMultiplier",
                    "Підписник (×)",
                    undefined,
                    0.1,
                  )}
                </div>

                <h3 className="command-ref__group-title">
                  Щоденний бонус (!{form.bonusCommand})
                </h3>
                <div className="form form--inline">
                  {numberField("guestDailyBonus", "Гість")}
                  {numberField("loyalDailyBonus", "Активний")}
                  {numberField("supporterDailyBonus", "Підписник")}
                </div>

                <h3 className="command-ref__group-title">
                  Бонус за стрік (за день присутності)
                </h3>
                <div className="form form--inline">
                  {numberField("guestStreakBonus", "Гість")}
                  {numberField("loyalStreakBonus", "Активний")}
                  {numberField("supporterStreakBonus", "Підписник")}
                </div>

                <h3 className="command-ref__group-title">Інше</h3>
                <div className="form form--inline">
                  <label className="field">
                    <span className="field__label">Команда щоденного бонусу</span>
                    <input
                      className="field__input"
                      value={form.bonusCommand}
                      onChange={(event) =>
                        setFormValue("bonusCommand", event.target.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>
                  {numberField(
                    "bonusCooldownSec",
                    "Кулдаун бонусу (с)",
                    "86400 = раз на добу",
                  )}
                  {numberField(
                    "supporterSongPriority",
                    "Пріоритет пісні підписника",
                    "донати ставлять пріоритет = сумі (зазвичай вище)",
                  )}
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
              <button
                className="button button--primary"
                type="submit"
                disabled={saving}
              >
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
