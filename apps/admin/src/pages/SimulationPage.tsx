import { useState, type FormEvent } from "react";
import { simulateChat, type SimulateChatResult } from "../api/simulation";
import type { BuffEffectType } from "../types/buffs";
import { PerkTester } from "./PerkTester";

type EffectChoice = "none" | BuffEffectType;

type FormState = {
  text: string;
  userLogin: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  newUserEachRun: boolean;
  grantBefore: number;
  effectType: EffectChoice;
  effectMagnitude: number;
  targetLogin: string;
  targetGrant: number;
  targetPresentLurker: boolean;
  targetShield: boolean;
};

const initialForm: FormState = {
  text: "!рулетка",
  userLogin: "simulator",
  isBroadcaster: false,
  isModerator: false,
  newUserEachRun: true,
  grantBefore: 1000,
  effectType: "none",
  effectMagnitude: 73,
  targetLogin: "",
  targetGrant: 1000,
  targetPresentLurker: true,
  targetShield: false,
};

export function SimulationPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<SimulateChatResult[]>([]);

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setError(null);

    try {
      const result = await simulateChat({
        text: form.text,
        userLogin: form.userLogin,
        isBroadcaster: form.isBroadcaster,
        isModerator: form.isModerator,
        newUserEachRun: form.newUserEachRun,
        grantBefore: form.grantBefore,
        applyEffectType:
          form.effectType === "none" ? undefined : form.effectType,
        applyEffectMagnitude:
          form.effectType === "none" ? undefined : form.effectMagnitude,
        targetLogin: form.targetLogin.trim() || undefined,
        targetGrant: form.targetGrant,
        targetPresentLurker: form.targetPresentLurker,
        targetShield: form.targetShield,
      });

      setLog((current) => [result, ...current].slice(0, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося виконати симуляцію");
    } finally {
      setRunning(false);
    }
  }

  // Run a command for the perk tester on a PERSISTENT sim user (so streak /
  // bonus cooldown / wallet stick between runs) and surface it in the same log.
  async function runPerkCommand(text: string, login: string) {
    setRunning(true);
    setError(null);

    try {
      const result = await simulateChat({
        text,
        userLogin: login,
        newUserEachRun: false,
        grantBefore: 0,
      });

      setLog((current) => [result, ...current].slice(0, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося виконати симуляцію");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page">
      <div className="page-columns page-columns--align-start">
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Симуляція чату</h2>
              <p className="card__subtitle">
                Прогнати команду через справжній пайплайн без відправки в чат
              </p>
            </div>
          </div>

          {error ? (
            <div className="state-block state-block--error">{error}</div>
          ) : null}

          <form className="form" onSubmit={handleRun}>
            <label className="field">
              <span className="field__label">Повідомлення / команда</span>
              <input
                className="field__input"
                value={form.text}
                onChange={(event) => setFormValue("text", event.target.value)}
                placeholder="!рулетка"
                disabled={running}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Логін глядача</span>
              <input
                className="field__input"
                value={form.userLogin}
                onChange={(event) => setFormValue("userLogin", event.target.value)}
                disabled={running}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Доповнити баланс до</span>
              <input
                className="field__input"
                type="number"
                min={0}
                value={form.grantBefore}
                onChange={(event) =>
                  setFormValue("grantBefore", Number(event.target.value) || 0)
                }
                disabled={running}
              />
              <span className="field__hint">
                Догори до цієї суми, лише якщо балансу менше (0 — не чіпати, щоб
                перевірити «недостатньо»)
              </span>
            </label>

            <div className="form form--inline">
              <label className="field">
                <span className="field__label">Застосувати ефект</span>
                <select
                  className="field__input"
                  value={form.effectType}
                  onChange={(event) =>
                    setFormValue("effectType", event.target.value as EffectChoice)
                  }
                  disabled={running}
                >
                  <option value="none">без ефекту</option>
                  <option value="chance">chance (зсув шансу, +/-%)</option>
                  <option value="multiplier">multiplier (% виграшу, 73 = ×0.73)</option>
                  <option value="flat">flat (плоский бонус)</option>
                  <option value="guarantee">guarantee (≥0 виграш, &lt;0 програш)</option>
                </select>
              </label>

              <label className="field">
                <span className="field__label">Сила ефекту</span>
                <input
                  className="field__input"
                  type="number"
                  value={form.effectMagnitude}
                  onChange={(event) =>
                    setFormValue("effectMagnitude", Number(event.target.value) || 0)
                  }
                  disabled={running || form.effectType === "none"}
                />
              </label>
            </div>

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={form.newUserEachRun}
                onChange={(event) =>
                  setFormValue("newUserEachRun", event.target.checked)
                }
                disabled={running}
              />
              <span>Новий користувач щоразу (обхід кулдауну рулетки)</span>
            </label>

            <div className="form form--inline">
              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={form.isBroadcaster}
                  onChange={(event) =>
                    setFormValue("isBroadcaster", event.target.checked)
                  }
                  disabled={running}
                />
                <span>Стрімер (бейдж broadcaster)</span>
              </label>

              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={form.isModerator}
                  onChange={(event) =>
                    setFormValue("isModerator", event.target.checked)
                  }
                  disabled={running}
                />
                <span>Модератор (бейдж moderator)</span>
              </label>
            </div>

            <div className="command-ref__group">
              <h3 className="command-ref__group-title">
                Ціль (для !вкрасти / !передати)
              </h3>

              <label className="field">
                <span className="field__label">Логін цілі</span>
                <input
                  className="field__input"
                  value={form.targetLogin}
                  onChange={(event) =>
                    setFormValue("targetLogin", event.target.value)
                  }
                  placeholder="напр. victim (порожньо — без цілі)"
                  disabled={running}
                />
              </label>

              <label className="field">
                <span className="field__label">Баланс цілі (доповнити до)</span>
                <input
                  className="field__input"
                  type="number"
                  min={0}
                  value={form.targetGrant}
                  onChange={(event) =>
                    setFormValue("targetGrant", Number(event.target.value) || 0)
                  }
                  disabled={running}
                />
              </label>

              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={form.targetPresentLurker}
                  onChange={(event) =>
                    setFormValue("targetPresentLurker", event.target.checked)
                  }
                  disabled={running}
                />
                <span>Ціль присутня й люркає (можна красти)</span>
              </label>

              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={form.targetShield}
                  onChange={(event) =>
                    setFormValue("targetShield", event.target.checked)
                  }
                  disabled={running}
                />
                <span>Ціль під щитом 🛡️</span>
              </label>
            </div>

            <div className="actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={running}
              >
                {running ? "Виконання..." : "Запустити"}
              </button>

              {log.length > 0 ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setLog([])}
                  disabled={running}
                >
                  Очистити лог
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Результати</h2>
              <p className="card__subtitle">Відповіді бота та стан глядача</p>
            </div>
          </div>

          {log.length === 0 ? (
            <div className="state-block">Поки немає запусків</div>
          ) : (
            <div className="events-list">
              {log.map((entry, index) => (
                <article className="event-card" key={`${entry.chatter.twitchUserId}-${index}`}>
                  <div className="event-card__top">
                    <div>
                      <strong>{entry.text}</strong>
                      <span className="table-muted">
                        {entry.chatter.displayName} (@{entry.chatter.userLogin})
                        {entry.chatter.badges.length > 0
                          ? ` · ${entry.chatter.badges.join(", ")}`
                          : ""}
                      </span>
                      <span className="table-muted">
                        баланс після: {entry.balance}
                        {entry.target
                          ? ` · ціль @${entry.target.userLogin}: ${entry.target.balance}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  {entry.responses.length > 0 ? (
                    entry.responses.map((response, responseIndex) => (
                      <div
                        className="state-block"
                        key={responseIndex}
                      >
                        🤖 {response}
                      </div>
                    ))
                  ) : (
                    <div className="state-block state-block--warning">
                      Бот нічого не відповів (команда не розпізнана або без
                      відповіді)
                    </div>
                  )}

                  {entry.activeBuffs.length > 0 ? (
                    <div className="table-muted">
                      Активні ефекти:{" "}
                      {entry.activeBuffs
                        .map(
                          (buff) =>
                            `${buff.title} (${buff.effectType} ${buff.magnitude})`,
                        )
                        .join(", ")}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <PerkTester onRunCommand={runPerkCommand} running={running} />
    </div>
  );
}
