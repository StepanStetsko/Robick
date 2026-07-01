import { useState } from "react";
import {
  addSupporter,
  debugResetBonus,
  debugSetStreak,
  inspectSupporter,
  removeSupporter,
} from "../api/supporter";
import type { SupporterInspect, SupporterTier } from "../types/supporter";

const tierBadge: Record<SupporterTier, { label: string; cls: string }> = {
  guest: { label: "Гість", cls: "badge badge--muted" },
  loyal: { label: "🔵 Активний", cls: "badge badge--success" },
  supporter: { label: "🟣 Підписник", cls: "badge badge--warning" },
};

function formatReady(sec: number): string {
  if (sec <= 0) {
    return "готовий зараз";
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) {
    return m > 0 ? `через ${h} год ${m} хв` : `через ${h} год`;
  }
  if (m > 0) {
    return `через ${m} хв`;
  }
  return `через ${sec} с`;
}

type Props = {
  onRunCommand: (text: string, login: string) => Promise<void>;
  running: boolean;
};

export function PerkTester({ onRunCommand, running }: Props) {
  const [login, setLogin] = useState("perk_test");
  const [streakDays, setStreakDays] = useState(5);
  const [songUrl, setSongUrl] = useState("https://youtu.be/dQw4w9WgXcQ");
  const [inspect, setInspect] = useState<SupporterInspect | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedLogin = login.trim();
  const disabled = busy || running || !trimmedLogin;

  async function act(
    fn: () => Promise<SupporterInspect>,
    okMessage: string,
  ) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setInspect(await fn());
      setStatus(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    await act(() => inspectSupporter(trimmedLogin), "Оновлено");
  }

  async function runCommand(text: string) {
    await onRunCommand(text, trimmedLogin);
    // Reflect side effects (bonus cooldown, streak) after the run.
    try {
      setInspect(await inspectSupporter(trimmedLogin));
    } catch {
      /* ignore — the run itself already reported errors */
    }
  }

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <h2 className="card__title">🎖️ Тест перків (Supporter / Loyal)</h2>
          <p className="card__subtitle">
            Признач рівень, накрути стрік і прожени <code>!бонус</code> /{" "}
            <code>!пісня</code> — усе для одного логіна. Відповіді бота зʼявляються
            в «Результатах».
          </p>
        </div>
      </div>

      {error ? (
        <div className="state-block state-block--error">{error}</div>
      ) : null}

      {/* Крок 1 — кого тестуємо */}
      <div className="command-ref__group">
        <h3 className="command-ref__group-title">1. Кого тестуємо</h3>
        <div className="form form--inline">
          <label className="field">
            <span className="field__label">Логін глядача</span>
            <input
              className="field__input"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="perk_test"
              disabled={busy}
            />
          </label>
          <div className="actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void refresh()}
              disabled={disabled}
            >
              Показати рівень
            </button>
          </div>
        </div>

        {inspect ? (
          <div className="state-block">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={tierBadge[inspect.tier].cls}>
                {tierBadge[inspect.tier].label}
              </span>
              <strong>@{inspect.login}</strong>
              {!inspect.enabled ? (
                <span className="badge badge--muted">систему вимкнено</span>
              ) : null}
            </div>
            <span className="table-muted">
              множник заробітку ×{inspect.earnMultiplier} · стрік{" "}
              {inspect.streakDays}/{inspect.loyalStreakDays} дн · щоденний бонус{" "}
              {inspect.dailyBonus} (+{inspect.streakBonus} за стрік) · пріоритет
              пісні {inspect.songPriority}
            </span>
            <span className="table-muted">
              !бонус: {formatReady(inspect.bonusReadyInSec)}
              {inspect.greetingPreview
                ? ` · привітання: «${inspect.greetingPreview}»`
                : ""}
            </span>
          </div>
        ) : (
          <div className="state-block">
            Введи логін і натисни «Показати рівень».
          </div>
        )}
      </div>

      {/* Крок 2 — налаштувати для тесту */}
      <div className="command-ref__group">
        <h3 className="command-ref__group-title">2. Налаштувати для тесту</h3>
        <div className="actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            className="button button--ghost"
            type="button"
            onClick={() =>
              void act(
                () =>
                  addSupporter({ userLogin: trimmedLogin, note: "тест" }).then(
                    () => inspectSupporter(trimmedLogin),
                  ),
                "Додано в підписники 🟣",
              )
            }
            disabled={disabled}
          >
            Зробити підписником 🟣
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() =>
              void act(
                () =>
                  removeSupporter(trimmedLogin).then(() =>
                    inspectSupporter(trimmedLogin),
                  ),
                "Прибрано з підписників",
              )
            }
            disabled={disabled}
          >
            Прибрати підписника
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() =>
              void act(
                () => debugResetBonus(trimmedLogin),
                "Кулдаун !бонус скинуто",
              )
            }
            disabled={disabled}
          >
            Скинути кулдаун !бонус
          </button>
        </div>

        <div className="form form--inline" style={{ marginTop: 12 }}>
          <label className="field">
            <span className="field__label">Встановити стрік (днів)</span>
            <input
              className="field__input"
              type="number"
              min={0}
              value={streakDays}
              onChange={(event) =>
                setStreakDays(Number(event.target.value) || 0)
              }
              disabled={busy}
            />
            <span className="field__hint">
              щоб дійти до «Активний» (loyal) без чекання реальних стрімів
            </span>
          </label>
          <div className="actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() =>
                void act(
                  () => debugSetStreak(trimmedLogin, streakDays),
                  `Стрік = ${streakDays}`,
                )
              }
              disabled={disabled}
            >
              Встановити стрік
            </button>
          </div>
        </div>
      </div>

      {/* Крок 3 — прогнати команди */}
      <div className="command-ref__group">
        <h3 className="command-ref__group-title">3. Прогнати команди</h3>
        <div className="actions" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void runCommand("!бонус")}
            disabled={disabled}
          >
            Прожени !бонус
          </button>
        </div>

        <div className="form form--inline" style={{ marginTop: 12 }}>
          <label className="field">
            <span className="field__label">Посилання для !пісня</span>
            <input
              className="field__input"
              value={songUrl}
              onChange={(event) => setSongUrl(event.target.value)}
              placeholder="https://youtu.be/..."
              disabled={busy}
            />
          </label>
          <div className="actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void runCommand(`!пісня ${songUrl.trim()}`)}
              disabled={disabled || !songUrl.trim()}
            >
              Прожени !пісня
            </button>
          </div>
        </div>
      </div>

      {status ? <div className="state-block">✅ {status}</div> : null}

      <div className="tab-panel__intro">
        ⚠️ Множник заробітку й привітання спрацьовують <strong>лише в ефірі</strong>{" "}
        (live-gate). Тут видно, які значення налаштовано; щоб побачити їх у дії —
        перевіряй на живому стрімі. <code>!бонус</code> і пріоритет
        <code>!пісня</code> працюють і офлайн.
      </div>
    </div>
  );
}
