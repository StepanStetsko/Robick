import { useEffect, useMemo, useState } from "react";
import { getPresenceLog, refreshPresenceLog } from "../api/presence";
import type { PresenceLogEntry } from "../types/presence";

type Filter = "all" | "present" | "lurkers" | "chatted";

const filterOptions: { value: Filter; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "present", label: "Зараз у чаті" },
  { value: "lurkers", label: "Мовчуни (зараз)" },
  { value: "chatted", label: "Писали" },
];

function isLurker(entry: PresenceLogEntry): boolean {
  return entry.presentNow && !entry.hasChatted;
}

function formatTime(value: number | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString();
}

export function PresencePage() {
  const [entries, setEntries] = useState<PresenceLogEntry[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const log = await getPresenceLog();
      setEntries(log.entries);
      setUpdatedAt(log.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося завантажити лог");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);

    try {
      const log = await refreshPresenceLog();
      setEntries(log.entries);
      setUpdatedAt(log.updatedAt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не вдалося опитати чат (бот має бути запущений)",
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const presentCount = useMemo(
    () => entries.filter((entry) => entry.presentNow).length,
    [entries],
  );
  const lurkerCount = useMemo(
    () => entries.filter((entry) => isLurker(entry)).length,
    [entries],
  );

  const visible = useMemo(() => {
    const filtered = entries.filter((entry) => {
      if (filter === "present") {
        return entry.presentNow;
      }
      if (filter === "lurkers") {
        return isLurker(entry);
      }
      if (filter === "chatted") {
        return entry.hasChatted;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.presentNow !== b.presentNow) {
        return a.presentNow ? -1 : 1;
      }
      return b.lastSeenAt - a.lastSeenAt;
    });
  }, [entries, filter]);

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Хто на стрімі</h2>
            <p className="card__subtitle">
              Глядачі в чаті за поточну добу (оновлюється кожні ~5 хв + при
              кожному повідомленні; зберігається між перезапусками й скидається
              опівночі). Мовчуни — зайшли, але жодного разу не писали.
            </p>
          </div>

          <div className="actions">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? "Оновлення..." : "Опитати чат зараз"}
            </button>
          </div>
        </div>

        <div className="actions">
          <span className="badge badge--muted">усього: {entries.length}</span>
          <span className="badge badge--success">у чаті: {presentCount}</span>
          <span className="badge badge--warning">мовчуни: {lurkerCount}</span>
          {updatedAt ? (
            <span className="badge badge--muted">
              оновлено: {formatTime(updatedAt)}
            </span>
          ) : null}
        </div>

        <div className="actions">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`button ${
                filter === option.value ? "button--primary" : "button--ghost"
              }`}
              type="button"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? <div className="state-block">Завантаження...</div> : null}
        {error ? (
          <div className="state-block state-block--error">{error}</div>
        ) : null}

        {!loading && !error && visible.length === 0 ? (
          <div className="state-block">
            Поки нікого. Запусти бота (Runtime) і натисни «Опитати чат зараз».
          </div>
        ) : null}

        {!loading && visible.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>глядач</th>
                  <th>статус</th>
                  <th>присутній</th>
                  <th>повідомлень</th>
                  <th>перший раз</th>
                  <th>востаннє</th>
                  <th>останнє повідомлення</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr key={entry.twitchUserId}>
                    <td>
                      <strong>{entry.displayName}</strong>
                      <span className="table-muted">@{entry.userLogin}</span>
                    </td>
                    <td>
                      {entry.hasChatted ? (
                        <span className="badge badge--success">пише</span>
                      ) : (
                        <span className="badge badge--warning">мовчить</span>
                      )}
                    </td>
                    <td>
                      {entry.presentNow ? (
                        <span className="badge badge--success">у чаті</span>
                      ) : (
                        <span className="badge badge--muted">вийшов</span>
                      )}
                    </td>
                    <td>{entry.messageCount}</td>
                    <td>{formatTime(entry.firstSeenAt)}</td>
                    <td>{formatTime(entry.lastSeenAt)}</td>
                    <td>{formatTime(entry.lastChatAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
