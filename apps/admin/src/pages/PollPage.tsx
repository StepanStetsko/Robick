import { useEffect, useRef, useState } from "react";
import { clearPoll, getPoll, startPoll, stopPoll } from "../api/poll";
import { MAX_POLL_OPTIONS, type PollState } from "../types/poll";

export function PollPage() {
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [durationSec, setDurationSec] = useState(60);
  const [state, setState] = useState<PollState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const overlayUrl = `${window.location.origin}/overlay/poll`;
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function refresh() {
      try {
        setState(await getPoll());
      } catch {
        // keep previous
      }
    }
    void refresh();
    pollingRef.current = setInterval(() => void refresh(), 800);
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      clearInterval(clock);
    };
  }, []);

  function setOption(index: number, value: string) {
    setOptions((cur) => cur.map((o, i) => (i === index ? value : o)));
  }

  function addOption() {
    setOptions((cur) =>
      cur.length < MAX_POLL_OPTIONS ? [...cur, ""] : cur,
    );
  }

  function removeOption(index: number) {
    setOptions((cur) => (cur.length > 2 ? cur.filter((_, i) => i !== index) : cur));
  }

  async function handleStart() {
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!title.trim()) {
      setError("Введи заголовок голосування");
      return;
    }
    if (cleaned.length < 2) {
      setError("Треба щонайменше 2 варіанти");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setState(await startPoll({ title: title.trim(), options: cleaned, durationSec }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося запустити");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setBusy(true);
    try {
      setState(await stopPoll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      setState(await clearPoll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function copyOverlay() {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  const running = state?.status === "running";
  const ended = state?.status === "ended";
  const secondsLeft =
    running && state?.endsAt
      ? Math.max(0, Math.ceil((state.endsAt - now) / 1000))
      : 0;

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Голосування</h2>
            <p className="card__subtitle">
              Заголовок + варіанти (до {MAX_POLL_OPTIONS}) + час. Глядачі
              голосують у чаті цифрою або точним текстом варіанту (один голос на
              людину). Віджет — окремий Browser Source в OBS.
            </p>
          </div>
        </div>

        {error ? (
          <div className="state-block state-block--error">{error}</div>
        ) : null}

        <div className="command-ref__group">
          <h3 className="command-ref__group-title">Віджет для OBS</h3>
          <p className="tab-panel__intro">
            Додай як <strong>Browser Source</strong> (окремо від плеєра). Зʼявиться
            на сцені, коли запустиш голосування, і зникне, коли прибереш.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <code>{overlayUrl}</code>
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={() => void copyOverlay()}
            >
              {copied ? "Скопійовано ✓" : "Копіювати адресу"}
            </button>
          </div>
        </div>

        {/* Compose */}
        <div className="command-ref__group">
          <h3 className="command-ref__group-title">Нове голосування</h3>

          <label className="field">
            <span className="field__label">Заголовок</span>
            <input
              className="field__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Напр. Що граємо далі?"
              disabled={busy}
            />
          </label>

          <span className="field__label" style={{ marginBottom: 6 }}>
            Варіанти ({options.length}/{MAX_POLL_OPTIONS})
          </span>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {options.map((opt, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <span style={{ width: 20, color: "#8b93a4" }}>{i + 1}.</span>
                <input
                  className="field__input"
                  style={{ flex: 1 }}
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Варіант ${i + 1}`}
                  disabled={busy}
                />
                <button
                  className="button button--ghost button--small"
                  type="button"
                  onClick={() => removeOption(i)}
                  disabled={busy || options.length <= 2}
                  title="Прибрати варіант"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="form form--inline">
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={addOption}
              disabled={busy || options.length >= MAX_POLL_OPTIONS}
            >
              + Додати варіант
            </button>

            <label className="field">
              <span className="field__label">Тривалість (с)</span>
              <input
                className="field__input"
                type="number"
                min={5}
                max={3600}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value) || 5)}
                disabled={busy}
              />
            </label>
          </div>

          <div className="actions" style={{ marginTop: 12 }}>
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleStart()}
              disabled={busy}
            >
              ▶ Запустити голосування
            </button>
          </div>
        </div>

        {/* Live state */}
        {state && state.active ? (
          <div className="command-ref__group">
            <h3 className="command-ref__group-title">
              {running ? `Триває · ⏳ ${secondsLeft}s` : "Завершено"}
            </h3>
            <div className="state-block" style={{ gap: 10 }}>
              <strong style={{ fontSize: 16 }}>{state.title}</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {state.options.map((o, i) => {
                  const isWinner = ended && state.winnerIndex === i;
                  const pct =
                    state.totalVotes > 0
                      ? Math.round((o.votes / state.totalVotes) * 100)
                      : 0;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: isWinner
                          ? "rgba(245,197,24,0.14)"
                          : "rgba(255,255,255,0.04)",
                        border: isWinner
                          ? "1px solid rgba(245,197,24,0.6)"
                          : "1px solid transparent",
                        opacity: ended && !isWinner ? 0.55 : 1,
                      }}
                    >
                      <span>
                        <span style={{ color: "#8b93a4", marginRight: 8 }}>
                          {i + 1}
                        </span>
                        {o.label}
                        {isWinner ? " 🏆" : ""}
                      </span>
                      <span style={{ fontWeight: 700 }}>
                        {o.votes} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <span className="table-muted" style={{ marginTop: 6 }}>
                Усього голосів: {state.totalVotes}
              </span>
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              {running ? (
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void handleStop()}
                  disabled={busy}
                >
                  ⏹ Зупинити зараз
                </button>
              ) : null}
              <button
                className="button button--danger"
                type="button"
                onClick={() => void handleClear()}
                disabled={busy}
                title="Прибрати віджет з OBS"
              >
                Прибрати з OBS
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
