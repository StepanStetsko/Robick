import { useEffect, useRef, useState } from "react";
import { subscribeToTwitchRealtime } from "../api/realtime";
import { getRuntimeStatus, startRuntime, stopRuntime } from "../api/twitch";
import type { TwitchRuntimeStatus } from "../types/twitch";

export function RuntimePage() {
  const [data, setData] = useState<TwitchRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  async function loadStatus() {
    setError(null);

    try {
      const result = await getRuntimeStatus();

      if (!isMountedRef.current) {
        return;
      }

      setData(result);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : "Не вдалося отримати статус");
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setLoading(false);
    }
  }

  async function handleStart() {
    setActionLoading("start");
    setError(null);

    try {
      const result = await startRuntime();

      if (!isMountedRef.current) {
        return;
      }

      setData(result);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : "Не вдалося запустити runtime");
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setLoading(false);
      setActionLoading(null);
    }
  }

  async function handleStop() {
    setActionLoading("stop");
    setError(null);

    try {
      const result = await stopRuntime();

      if (!isMountedRef.current) {
        return;
      }

      setData(result);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : "Не вдалося зупинити runtime");
    } finally {
      if (!isMountedRef.current) {
        return;
      }

      setActionLoading(null);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    void loadStatus();

    const unsubscribe = subscribeToTwitchRealtime({
      onOpen: () => {
        if (isMountedRef.current) {
          setStreamConnected(true);
        }
      },
      onError: () => {
        if (isMountedRef.current) {
          setStreamConnected(false);
        }
      },
      onSnapshot: (snapshot) => {
        if (isMountedRef.current) {
          setData(snapshot.runtime);
          setLoading(false);
        }
      },
      onRuntimeStatus: (runtime) => {
        if (isMountedRef.current) {
          setData(runtime);
          setLoading(false);
        }
      },
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Стан runtime</h2>
            <p className="card__subtitle">
              Поточний стан Twitch runtime, акаунтів і EventSub-сесій
            </p>
          </div>

          <div className="actions">
            <span
              className={`badge ${streamConnected ? "badge--success" : "badge--warning"}`}
            >
              {streamConnected ? "Realtime підключено" : "Realtime відключено"}
            </span>

            <button
              className="button button--primary"
              onClick={() => void handleStart()}
              disabled={actionLoading !== null}
            >
              {actionLoading === "start" ? "Запуск..." : "Запустити"}
            </button>

            <button
              className="button button--danger"
              onClick={() => void handleStop()}
              disabled={actionLoading !== null}
            >
              {actionLoading === "stop" ? "Зупинка..." : "Зупинити"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="state-block">Завантаження статусу...</div>
        ) : error ? (
          <div className="state-block state-block--error">{error}</div>
        ) : data ? (
          <div className="status-grid">
            <div className="status-item">
              <span className="status-item__label">Runtime запущено</span>
              <strong>{formatBoolean(data.runtimeStarted)}</strong>
            </div>

            <div className="status-item">
              <span className="status-item__label">Стрімер підключений</span>
              <strong>{formatBoolean(data.broadcasterConnected)}</strong>
            </div>

            <div className="status-item">
              <span className="status-item__label">Бот підключений</span>
              <strong>{formatBoolean(data.botConnected)}</strong>
            </div>

            <div className="status-item">
              <span className="status-item__label">Сесія бота активна</span>
              <strong>{formatBoolean(data.botSessionConnected)}</strong>
            </div>

            <div className="status-item">
              <span className="status-item__label">Сесія стрімера активна</span>
              <strong>{formatBoolean(data.broadcasterSessionConnected)}</strong>
            </div>

            <div className="status-item">
              <span className="status-item__label">Остання подія о</span>
              <strong>{formatDateTime(data.lastEventAt)}</strong>
            </div>
          </div>
        ) : (
          <div className="state-block">Статус недоступний</div>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Сира відповідь</h2>
            <p className="card__subtitle">Сирий JSON з бекенду для дебагу</p>
          </div>
        </div>

        <pre className="code-block">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}

function formatBoolean(value: boolean) {
  return value ? "Так" : "Ні";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
