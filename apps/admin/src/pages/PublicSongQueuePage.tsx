import { useEffect, useRef, useState, type FormEvent } from "react";
import { NowPlayingCard } from "../components/NowPlayingCard";

// Public, no-auth page where viewers can watch the song queue and add their own
// song by typing a name + YouTube link. Uses plain fetch against the public
// (no-auth) song-queue endpoints — no admin cookie required. Add as /songs.

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

const POLL_MS = 4000;
const NAME_STORAGE_KEY = "robik.songs.name";

type SongEntry = {
  id: string;
  videoId: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  requestedBy: string;
  priority: number;
  source: string;
  status: string;
};

type QueueState = {
  current: SongEntry | null;
  queue: SongEntry[];
  paused: boolean;
};

type RequestResult =
  | { ok: true; position?: number }
  | {
      ok: false;
      reason?: string;
      secondsLeft?: number;
      durationSec?: number;
      maxDurationSec?: number;
    };

const REASON_TEXT: Record<string, string> = {
  disabled: "Замовлення пісень зараз вимкнено.",
  invalidUrl: "Дай коректне посилання на YouTube.",
  queueFull: "У тебе вже максимум пісень у черзі. Зачекай, поки зіграють.",
  cooldown: "Зачекай трохи перед наступним замовленням.",
  duplicate: "Ця пісня вже в черзі.",
  blocked: "Цю пісню заборонено замовляти.",
  tooLong: "Пісня задовга — вибери коротшу.",
};

async function fetchQueue(): Promise<QueueState | null> {
  const res = await fetch(`${API_BASE}/api/public/song-queue`);
  const json = (await res.json()) as { ok: boolean; data: QueueState | null };
  return json.data ?? null;
}

async function fetchHistory(): Promise<SongEntry[]> {
  const res = await fetch(`${API_BASE}/api/public/song-queue/history`);
  const json = (await res.json()) as { ok: boolean; data: SongEntry[] };
  return json.data ?? [];
}

async function submitSong(name: string, url: string): Promise<RequestResult> {
  const res = await fetch(`${API_BASE}/api/public/song-queue/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, url }),
  });
  return (await res.json()) as RequestResult;
}

export function PublicSongQueuePage() {
  const [state, setState] = useState<QueueState>({
    current: null,
    queue: [],
    paused: false,
  });
  const [history, setHistory] = useState<SongEntry[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);
  const disposed = useRef(false);

  useEffect(() => {
    setName(localStorage.getItem(NAME_STORAGE_KEY) ?? "");
  }, []);

  async function refresh() {
    try {
      const [queue, hist] = await Promise.all([fetchQueue(), fetchHistory()]);
      if (disposed.current) {
        return;
      }
      if (queue) {
        setState(queue);
      }
      setHistory(hist);
    } catch {
      // transient — retried on the next tick
    }
  }

  useEffect(() => {
    disposed.current = false;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      disposed.current = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();

    if (!trimmedName || !trimmedUrl) {
      setNotice({ kind: "error", text: "Впиши імʼя і посилання на пісню." });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      localStorage.setItem(NAME_STORAGE_KEY, trimmedName);
      const result = await submitSong(trimmedName, trimmedUrl);

      if (result.ok) {
        setNotice({
          kind: "ok",
          text:
            result.position && result.position > 0
              ? `Готово! Твоя пісня в черзі під №${result.position}.`
              : "Готово! Пісню додано в чергу.",
        });
        setUrl("");
        await refresh();
      } else {
        let text = REASON_TEXT[result.reason ?? ""] ?? "Не вдалося додати пісню.";
        if (result.reason === "cooldown" && result.secondsLeft) {
          text = `Зачекай ще ${result.secondsLeft} с перед наступним замовленням.`;
        } else if (result.reason === "tooLong" && result.maxDurationSec) {
          text = `Пісня задовга. Максимум — ${Math.ceil(
            result.maxDurationSec / 60,
          )} хв.`;
        }
        setNotice({ kind: "error", text });
      }
    } catch {
      setNotice({
        kind: "error",
        text: "Сервер недоступний. Спробуй ще раз за мить.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <div>
          <h1 className="page-title">Черга пісень</h1>
          <p className="page-subtitle">
            Дивись, що грає, і замов свою пісню з YouTube
          </p>
        </div>
      </header>

      <main className="public-content">
        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Зараз грає</h2>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
            <NowPlayingCard
              title={state.current?.title ?? null}
              thumbnailUrl={state.current?.thumbnailUrl ?? null}
              requestedBy={state.current?.requestedBy ?? null}
              idle={!state.current}
              paused={state.paused}
            />
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Замовити пісню</h2>
              <p className="card__subtitle">
                Встав посилання на YouTube — пісня стане в чергу
              </p>
            </div>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <div className="form form--inline">
              <label className="field">
                <span className="field__label">Твоє імʼя</span>
                <input
                  className="field__input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="нік у чаті"
                  maxLength={40}
                  disabled={submitting}
                />
              </label>
              <label className="field" style={{ flex: 2 }}>
                <span className="field__label">Посилання на YouTube</span>
                <input
                  className="field__input"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://youtu.be/..."
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="form__footer">
              <button
                className="button button--primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Додаємо…" : "Додати в чергу"}
              </button>
              {notice ? (
                <span
                  className="field__hint"
                  style={{ color: notice.kind === "error" ? "#ffb5b2" : "#7ee0a1" }}
                >
                  {notice.text}
                </span>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Черга ({state.queue.length})</h2>
            </div>
          </div>
          {state.queue.length === 0 ? (
            <div className="state-block">Черга порожня — додай першу пісню!</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>пісня</th>
                    <th>замовив</th>
                  </tr>
                </thead>
                <tbody>
                  {state.queue.map((entry, index) => (
                    <tr key={entry.id}>
                      <td>#{index + 1}</td>
                      <td>
                        <strong>{entry.title || entry.videoId}</strong>
                        {entry.priority > 0 ? (
                          <span className="badge badge--warning">пріоритет</span>
                        ) : null}
                      </td>
                      <td>{entry.requestedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {history.length > 0 ? (
          <div className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Нещодавно грали</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{entry.title || entry.videoId}</strong>
                      </td>
                      <td>{entry.requestedBy}</td>
                      <td>
                        {entry.status === "skipped" ? (
                          <span className="badge badge--warning">пропущено</span>
                        ) : (
                          <span className="badge badge--muted">зіграно</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
