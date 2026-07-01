import { useEffect, useState, type FormEvent } from "react";
import { getEconomySettings, updateEconomySettings } from "../api/economy";
import { getHelpPreview } from "../api/help";
import type { EconomySettings } from "../types/economy";

/**
 * Editor for the built-in !команди (help) command. Its name and message
 * template live in economy settings. {commands} expands to the auto-generated
 * list of all enabled commands. "Підставити" copies that generated text into
 * the field so it can be edited freely.
 */
export function HelpCommandCard() {
  const [settings, setSettings] = useState<EconomySettings | null>(null);
  const [command, setCommand] = useState("");
  const [template, setTemplate] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [result, helpPreview] = await Promise.all([
        getEconomySettings(),
        getHelpPreview(),
      ]);
      setSettings(result);
      setCommand(result.helpCommand);
      setTemplate(result.messages.help);
      setPreview(helpPreview.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося завантажити команду",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function insertGenerated() {
    try {
      const helpPreview = await getHelpPreview();
      // Expand {commands} into the actual list so the text becomes editable.
      setPreview(helpPreview.message);
      setTemplate(helpPreview.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося згенерувати текст",
      );
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!settings) {
      return;
    }

    setSaving(true);
    setError(null);
    setSavedAt(null);

    try {
      // Send the full messages object so the other templates stay intact.
      const updated = await updateEconomySettings({
        helpCommand: command,
        messages: { ...settings.messages, help: template },
      });

      setSettings(updated);
      setCommand(updated.helpCommand);
      setTemplate(updated.messages.help);

      try {
        setPreview((await getHelpPreview()).message);
      } catch {
        // Preview refresh is best-effort; saving already succeeded.
      }

      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <h2 className="card__title">Команда !{command || "команди"}</h2>
          <p className="card__subtitle">
            Вбудована команда — показує список усіх команд одним повідомленням
          </p>
        </div>
      </div>

      {loading ? <div className="state-block">Завантаження...</div> : null}
      {error ? (
        <div className="state-block state-block--error">{error}</div>
      ) : null}
      {savedAt ? <div className="state-block">Збережено о {savedAt}</div> : null}

      {settings ? (
        <form className="form" onSubmit={handleSave}>
          <label className="field">
            <span className="field__label">Назва команди</span>
            <input
              className="field__input"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              disabled={saving}
              required
            />
            <span className="field__hint">без знака !</span>
          </label>

          {preview ? (
            <div className="field">
              <span className="field__label">Що побачать у чаті</span>
              <div className="state-block">{preview}</div>
            </div>
          ) : null}

          <label className="field">
            <span className="field__label">Шаблон повідомлення</span>
            <textarea
              className="field__input field__input--textarea"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              disabled={saving}
              rows={3}
            />
            <span className="field__hint">
              {"{commands}"} підставляє згенерований список. Натисни «Підставити
              згенерований текст», щоб розгорнути його у звичайний текст і
              редагувати вручну.
            </span>
          </label>

          <div className="actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={saving}
            >
              {saving ? "Збереження..." : "Зберегти"}
            </button>

            <button
              className="button button--ghost"
              type="button"
              onClick={() => void insertGenerated()}
              disabled={saving}
            >
              Підставити згенерований текст
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
