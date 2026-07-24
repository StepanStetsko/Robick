import { useEffect, useState, type FormEvent } from "react";
import {
  getDonatelloDonations,
  getDonatelloSettings,
  updateDonatelloSettings,
} from "../api/donatello";
import type {
  DonatelloDonation,
  DonatelloMessages,
  DonatelloSettings,
} from "../types/donatello";

type TabId = "settings" | "messages" | "donations";

type FormState = {
  enabled: boolean;
  songMinAmount: number;
  songPriority: number;
  currency: string;
  thankYouInChat: boolean;
  messages: DonatelloMessages;
};

const OUTCOME_LABELS: Record<string, string> = {
  queued: "🎵 У черзі",
  belowMin: "Нижче порогу",
  noLink: "Без посилання",
  rejected: "Відхилено",
  received: "Отримано",
};

function settingsToForm(settings: DonatelloSettings): FormState {
  return {
    enabled: settings.enabled,
    songMinAmount: settings.songMinAmount,
    songPriority: settings.songPriority,
    currency: settings.currency,
    thankYouInChat: settings.thankYouInChat,
    messages: settings.messages,
  };
}

export function DonatelloPage() {
  const [activeTab, setActiveTab] = useState<TabId>("settings");
  const [form, setForm] = useState<FormState | null>(null);
  const [donations, setDonations] = useState<DonatelloDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const callbackUrl = `${window.location.origin}/api/public/donatello/callback`;

  async function loadSettings() {
    try {
      const [settings, list] = await Promise.all([
        getDonatelloSettings(),
        getDonatelloDonations(),
      ]);
      setForm(settingsToForm(settings));
      setDonations(list);
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
      const updated = await updateDonatelloSettings({
        enabled: form.enabled,
        songMinAmount: form.songMinAmount,
        songPriority: form.songPriority,
        currency: form.currency,
        thankYouInChat: form.thankYouInChat,
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

  function setMessageValue(key: keyof DonatelloMessages, value: string) {
    setForm((current) =>
      current
        ? { ...current, messages: { ...current.messages, [key]: value } }
        : current,
    );
  }

  async function copyCallbackUrl() {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — user can copy manually
    }
  }

  async function refreshDonations() {
    try {
      setDonations(await getDonatelloDonations());
    } catch {
      // keep previous list
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Донати (Donatello)</h2>
            <p className="card__subtitle">
              Донат від {form?.songMinAmount ?? 50} {form?.currency || "UAH"} з
              YouTube-посиланням у повідомленні → пісня додається в чергу з
              пріоритетом (перестрибує звичайні замовлення).
            </p>
          </div>
        </div>

        {loading ? <div className="state-block">Завантаження...</div> : null}
        {error ? (
          <div className="state-block state-block--error">{error}</div>
        ) : null}

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
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "donations"}
                className={
                  activeTab === "donations"
                    ? "tab-button tab-button--active"
                    : "tab-button"
                }
                onClick={() => {
                  setActiveTab("donations");
                  void refreshDonations();
                }}
              >
                Донати
              </button>
            </div>

            {activeTab === "donations" ? (
              <div className="tab-panel">
                <p className="tab-panel__intro">
                  Останні донати, отримані через вебхук Donatello, і що бот з ними
                  зробив.
                </p>
                {donations.length === 0 ? (
                  <div className="state-block">Донатів ще не було.</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Час</th>
                        <th>Донатер</th>
                        <th>Сума</th>
                        <th>Результат</th>
                        <th>Пісня / повідомлення</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donations.map((d) => (
                        <tr key={d.id}>
                          <td>{new Date(d.createdAt).toLocaleString()}</td>
                          <td>{d.clientName ?? "—"}</td>
                          <td>
                            {d.amount ?? "—"} {d.currency ?? ""}
                          </td>
                          <td>{OUTCOME_LABELS[d.outcome] ?? d.outcome}</td>
                          <td>{d.songTitle ?? d.message ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <form className="form" onSubmit={handleSave}>
                {activeTab === "settings" ? (
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
                      <span>Інтеграцію Donatello увімкнено</span>
                    </label>

                    <div className="form form--inline">
                      <label className="field">
                        <span className="field__label">Мін. сума для пісні</span>
                        <input
                          className="field__input"
                          type="number"
                          min={0}
                          value={form.songMinAmount}
                          onChange={(event) =>
                            setFormValue(
                              "songMinAmount",
                              Number(event.target.value) || 0,
                            )
                          }
                          disabled={saving}
                        />
                        <span className="field__hint">
                          донат нижче цієї суми пісню не додає (тихо)
                        </span>
                      </label>

                      <label className="field">
                        <span className="field__label">Валюта</span>
                        <input
                          className="field__input"
                          value={form.currency}
                          onChange={(event) =>
                            setFormValue("currency", event.target.value)
                          }
                          disabled={saving}
                        />
                        <span className="field__hint">
                          рахуються лише донати в цій валюті; порожньо = будь-яка
                        </span>
                      </label>

                      <label className="field">
                        <span className="field__label">Пріоритет у черзі</span>
                        <input
                          className="field__input"
                          type="number"
                          min={1}
                          value={form.songPriority}
                          onChange={(event) =>
                            setFormValue(
                              "songPriority",
                              Number(event.target.value) || 1,
                            )
                          }
                          disabled={saving}
                        />
                        <span className="field__hint">
                          вище = раніше грає (звичайне замовлення = 0)
                        </span>
                      </label>
                    </div>

                    <label className="field field--checkbox">
                      <input
                        type="checkbox"
                        checked={form.thankYouInChat}
                        onChange={(event) =>
                          setFormValue("thankYouInChat", event.target.checked)
                        }
                        disabled={saving}
                      />
                      <span>Дякувати в чаті, коли пісню додано</span>
                    </label>

                    <p className="tab-panel__intro">
                      Встав цю адресу в розділ «Колбеки» кабінету Donatello, а
                      сам ключ (X-Key) — у <code>.env</code> сервера як{" "}
                      <code>DONATELLO_WEBHOOK_KEY</code> (без нього вебхук
                      вимкнено):
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
                      <code>{callbackUrl}</code>
                      <button
                        className="button button--ghost button--small"
                        type="button"
                        onClick={() => void copyCallbackUrl()}
                      >
                        {copied ? "Скопійовано ✓" : "Копіювати адресу"}
                      </button>
                    </div>
                  </>
                ) : null}

                {activeTab === "messages" ? (
                  <div className="command-ref__group">
                    <h3 className="command-ref__group-title">Повідомлення</h3>
                    <label className="field">
                      <span className="field__label">
                        Подяка + пісню додано
                      </span>
                      <textarea
                        className="field__input field__input--textarea"
                        value={form.messages.songAdded}
                        onChange={(event) =>
                          setMessageValue("songAdded", event.target.value)
                        }
                        disabled={saving}
                        rows={2}
                      />
                      <span className="field__hint">
                        {"{clientName}, {title}, {position}, {amount}, {currency}"}
                      </span>
                    </label>
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
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
