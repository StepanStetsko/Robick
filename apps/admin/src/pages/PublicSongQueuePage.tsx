import { useEffect, useRef, useState } from "react";
import { NowPlayingCard } from "../components/NowPlayingCard";

// Public, no-auth page where viewers can watch the song queue: what is playing
// now, what is queued and what recently played. Read-only — songs are ordered
// from the stream chat, not from here. Uses plain fetch against the public
// (no-auth) song-queue endpoints. Served at /songs.

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

const POLL_MS = 4000;

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

export function PublicSongQueuePage() {
  const [state, setState] = useState<QueueState>({
    current: null,
    queue: [],
    paused: false,
  });
  const [history, setHistory] = useState<SongEntry[]>([]);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;

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

    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);

    return () => {
      disposed.current = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="public-shell">
      <header className="public-header">
        <div>
          <h1 className="page-title">Черга пісень</h1>
          <p className="page-subtitle">
            Що грає зараз і що далі. Пісні замовляються в чаті стріму
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
              <h2 className="card__title">Черга ({state.queue.length})</h2>
            </div>
          </div>
          {state.queue.length === 0 ? (
            <div className="state-block">
              Черга порожня — замов пісню в чаті стріму.
            </div>
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
