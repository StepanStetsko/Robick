import { useEffect, useMemo, useState, type FormEvent } from "react";
import { clearTwitchEvents } from "../api/events";
import { subscribeToTwitchRealtime } from "../api/realtime";
import { sendBotMessage } from "../api/twitch";
import type {
  RewardHistoryItem,
  RewardQueueItem,
  RewardQueueStatus,
  TwitchEventLogEntry,
  TwitchEventLogSource,
} from "../types/events";
import type { AuthStatus } from "../types/auth";
import type { CustomCommandUsageHistoryEntry } from "../types/commands";
import type { TwitchRuntimeStatus } from "../types/twitch";
import "../styles/pages.css";

const COMMAND_HISTORY_LIMIT = 20;
const REWARD_QUEUE_LIMIT = 20;
const REWARD_HISTORY_LIMIT = 20;
const EVENT_LOG_LIMIT = 100;

type LevelFilter = "all" | TwitchEventLogEntry["level"];

export function DashboardPage() {
  const [runtime, setRuntime] = useState<TwitchRuntimeStatus | null>(null);
  const [queue, setQueue] = useState<RewardQueueStatus | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [events, setEvents] = useState<TwitchEventLogEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<
    CustomCommandUsageHistoryEntry[]
  >([]);
  const [rewardQueue, setRewardQueue] = useState<RewardQueueItem[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardHistoryItem[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);

  const [botMessage, setBotMessage] = useState("");
  const [sendingBotMessage, setSendingBotMessage] = useState(false);
  const [sendMessageError, setSendMessageError] = useState<string | null>(null);
  const [sendMessageSuccess, setSendMessageSuccess] = useState<string | null>(null);

  const [logSourceFilter, setLogSourceFilter] = useState<
    "all" | TwitchEventLogSource
  >("all");
  const [logLevelFilter, setLogLevelFilter] = useState<LevelFilter>("all");
  const [logSearch, setLogSearch] = useState("");
  const [clearingEvents, setClearingEvents] = useState(false);
  const [eventLogError, setEventLogError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToTwitchRealtime({
      onOpen: () => {
        setStreamConnected(true);
      },
      onError: () => {
        setStreamConnected(false);
      },
      onSnapshot: (snapshot) => {
        setRuntime(snapshot.runtime);
        setQueue(snapshot.queue);
        setAuth(snapshot.auth);
        setEvents(snapshot.events.slice(0, EVENT_LOG_LIMIT));
        setCommandHistory(snapshot.commandHistory.slice(0, COMMAND_HISTORY_LIMIT));
        setRewardQueue(snapshot.rewardQueue.slice(0, REWARD_QUEUE_LIMIT));
        setRewardHistory(snapshot.rewardHistory.slice(0, REWARD_HISTORY_LIMIT));
      },
      onRuntimeStatus: (value) => {
        setRuntime(value);
      },
      onQueueStatus: (value) => {
        setQueue(value);
      },
      onAuthStatus: (value) => {
        setAuth(value);
      },
      onEventAppended: (entry) => {
        setEvents((current) => [entry, ...current].slice(0, EVENT_LOG_LIMIT));
      },
      onEventCleared: () => {
        setEvents([]);
      },
      onCommandUsageAppended: (entry) => {
        setCommandHistory((current) => [entry, ...current].slice(0, COMMAND_HISTORY_LIMIT));
      },
      onRewardQueueUpdated: (items) => {
        setRewardQueue(items.slice(0, REWARD_QUEUE_LIMIT));
      },
      onRewardHistoryUpdated: (items) => {
        setRewardHistory(items.slice(0, REWARD_HISTORY_LIMIT));
      },
      onRewardHistoryAppended: (entry) => {
        setRewardHistory((current) => [entry, ...current].slice(0, REWARD_HISTORY_LIMIT));
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const connectedAccounts = useMemo(() => {
    if (!auth) {
      return 0;
    }

    return [auth.broadcaster, auth.bot].filter((item) => item.connected).length;
  }, [auth]);

  const queueProcessing = useMemo(() => {
    if (!queue) {
      return false;
    }

    const candidate = queue as RewardQueueStatus & { isProcessing?: boolean };

    if (typeof candidate.processing === "boolean") {
      return candidate.processing;
    }

    if (typeof candidate.isProcessing === "boolean") {
      return candidate.isProcessing;
    }

    return false;
  }, [queue]);

  const normalizedLogSearch = logSearch.trim().toLowerCase();

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (logSourceFilter !== "all" && event.source !== logSourceFilter) {
        return false;
      }

      if (logLevelFilter !== "all" && event.level !== logLevelFilter) {
        return false;
      }

      if (!normalizedLogSearch) {
        return true;
      }

      const searchable = [
        event.message,
        event.type,
        event.source,
        event.level,
        event.timestamp,
        safeJson(event.data),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedLogSearch);
    });
  }, [events, logLevelFilter, logSourceFilter, normalizedLogSearch]);

  async function handleSendBotMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = botMessage.trim();

    if (!message) {
      setSendMessageError("Потрібно ввести повідомлення");
      setSendMessageSuccess(null);
      return;
    }

    setSendingBotMessage(true);
    setSendMessageError(null);
    setSendMessageSuccess(null);

    try {
      await sendBotMessage(message);
      setBotMessage("");
      setSendMessageSuccess("Повідомлення надіслано");
    } catch (error) {
      setSendMessageError(
        error instanceof Error ? error.message : "Не вдалося надіслати повідомлення",
      );
    } finally {
      setSendingBotMessage(false);
    }
  }

  async function handleClearEventLog() {
    const confirmed = window.confirm("Очистити журнал подій?");
    if (!confirmed) {
      return;
    }

    setClearingEvents(true);
    setEventLogError(null);

    try {
      await clearTwitchEvents();
      setEvents([]);
    } catch (error) {
      setEventLogError(
        error instanceof Error ? error.message : "Не вдалося очистити журнал подій",
      );
    } finally {
      setClearingEvents(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Дашборд</h2>
            <p className="card__subtitle">Живе зведення по системі</p>
          </div>

          <span
            className={`badge ${streamConnected ? "badge--success" : "badge--warning"}`}
          >
            {streamConnected ? "Realtime підключено" : "Realtime відключено"}
          </span>
        </div>

        <div className="status-grid">
          <div className="status-item">
            <span className="status-item__label">Runtime запущено</span>
            <strong>{runtime ? formatBoolean(runtime.runtimeStarted) : "—"}</strong>
          </div>

          <div className="status-item">
            <span className="status-item__label">Сесія стрімера</span>
            <strong>
              {runtime ? formatBoolean(runtime.broadcasterSessionConnected) : "—"}
            </strong>
          </div>

          <div className="status-item">
            <span className="status-item__label">Сесія бота</span>
            <strong>{runtime ? formatBoolean(runtime.botSessionConnected) : "—"}</strong>
          </div>

          <div className="status-item">
            <span className="status-item__label">Підключені акаунти</span>
            <strong>{auth ? `${connectedAccounts}/2` : "—"}</strong>
          </div>

          <div className="status-item">
            <span className="status-item__label">Розмір черги</span>
            <strong>{queue ? queue.size : "—"}</strong>
          </div>

          <div className="status-item">
            <span className="status-item__label">Обробка черги</span>
            <strong>{queue ? formatBoolean(queueProcessing) : "—"}</strong>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Надіслати повідомлення від бота</h2>
            <p className="card__subtitle">Надіслати повідомлення в чат від імені бота</p>
          </div>
        </div>

        {sendMessageError ? (
          <div className="state-block state-block--error">{sendMessageError}</div>
        ) : null}

        {sendMessageSuccess ? (
          <div className="state-block">{sendMessageSuccess}</div>
        ) : null}

        <form className="form form--inline" onSubmit={handleSendBotMessage}>
          <label className="field">
            <span className="field__label">Повідомлення</span>
            <input
              className="field__input"
              type="text"
              value={botMessage}
              onChange={(event) => setBotMessage(event.target.value)}
              placeholder="Привіт, чат"
              disabled={sendingBotMessage}
            />
          </label>

          <div className="actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={sendingBotMessage}
            >
              {sendingBotMessage ? "Надсилання..." : "Надіслати"}
            </button>
          </div>
        </form>
      </div>

      <div className="dashboard-columns">
        <div className="card card--panel">
          <div className="card__header">
            <div>
              <h2 className="card__title">Історія команд</h2>
              <p className="card__subtitle">Останні використання кастомних команд</p>
            </div>
          </div>

          {commandHistory.length === 0 ? (
            <div className="state-block">Історія використання команд поки порожня</div>
          ) : (
            <div className="events-list dashboard-scroll-area">
              {commandHistory.map((entry) => (
                <article className="event-card" key={entry.id}>
                  <div className="event-card__top">
                    <div className="event-card__meta">
                      <span className="badge badge--muted">!{entry.commandName}</span>
                      <span className={`badge badge--${mapUsageStatus(entry.status)}`}>
                        {entry.status}
                      </span>
                      <span className="badge badge--muted">{entry.userLogin}</span>
                    </div>

                    <time className="event-card__time">
                      {formatDateTime(entry.timestamp)}
                    </time>
                  </div>

                  <div className="event-card__message">
                    {entry.userName} використав !{entry.commandName}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="card card--panel">
          <div className="card__header">
            <div>
              <h2 className="card__title">Черга reward-подій</h2>
              <p className="card__subtitle">Що зараз стоїть у черзі на виконання</p>
            </div>
          </div>

          {rewardQueue.length === 0 ? (
            <div className="state-block">Черга reward-подій порожня</div>
          ) : (
            <div className="events-list dashboard-scroll-area">
              {rewardQueue.map((entry) => (
                <article className="event-card" key={entry.id}>
                  <div className="event-card__top">
                    <div className="event-card__meta">
                      <span className="badge badge--muted">{entry.rewardTitle}</span>
                      <span className={`badge badge--${mapRewardQueueBadge(entry.status)}`}>
                        {entry.status}
                      </span>
                      <span className="badge badge--muted">{entry.userLogin}</span>
                    </div>

                    <time className="event-card__time">
                      {formatDateTime(entry.queuedAt)}
                    </time>
                  </div>

                  <div className="event-card__message">
                    {entry.userName ?? entry.userLogin} поставив у чергу {entry.rewardTitle}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="card card--panel">
          <div className="card__header">
            <div>
              <h2 className="card__title">Історія reward-подій</h2>
              <p className="card__subtitle">Хто і який reward використав</p>
            </div>
          </div>

          {rewardHistory.length === 0 ? (
            <div className="state-block">Історія reward-подій поки порожня</div>
          ) : (
            <div className="events-list dashboard-scroll-area">
              {rewardHistory.map((entry) => (
                <article className="event-card" key={entry.id}>
                  <div className="event-card__top">
                    <div className="event-card__meta">
                      <span className="badge badge--muted">{entry.rewardTitle}</span>
                      <span className={`badge badge--${mapRewardHistoryBadge(entry.status)}`}>
                        {entry.status}
                      </span>
                      <span className="badge badge--muted">{entry.userLogin}</span>
                    </div>

                    <time className="event-card__time">
                      {formatDateTime(entry.timestamp)}
                    </time>
                  </div>

                  <div className="event-card__message">
                    {entry.userName ?? entry.userLogin} використав {entry.rewardTitle}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="card card--panel card--event-log">
          <div className="card__header">
            <div>
              <h2 className="card__title">Журнал подій</h2>
              <p className="card__subtitle">
                Загальний лог системи • {filteredEvents.length} / {events.length}
              </p>
            </div>

            <div className="actions">
              <button
                className="button button--danger"
                type="button"
                onClick={() => void handleClearEventLog()}
                disabled={clearingEvents}
              >
                {clearingEvents ? "Очищення..." : "Очистити журнал"}
              </button>
            </div>
          </div>

          {eventLogError ? (
            <div className="state-block state-block--error">{eventLogError}</div>
          ) : null}

          <div className="dashboard-log-filters">
            <label className="field">
              <span className="field__label">Пошук</span>
              <input
                className="field__input"
                type="text"
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="повідомлення, source, type, user, reward..."
              />
            </label>

            <label className="field">
              <span className="field__label">Джерело</span>
              <select
                className="field__input"
                value={logSourceFilter}
                onChange={(event) =>
                  setLogSourceFilter(event.target.value as "all" | TwitchEventLogSource)
                }
              >
                <option value="all">Усі джерела</option>
                <option value="runtime">runtime</option>
                <option value="admin">admin</option>
                <option value="chat">chat</option>
                <option value="rewards">rewards</option>
                <option value="queue">queue</option>
                <option value="system">system</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">Рівень</span>
              <select
                className="field__input"
                value={logLevelFilter}
                onChange={(event) => setLogLevelFilter(event.target.value as LevelFilter)}
              >
                <option value="all">Усі рівні</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </label>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="state-block">Подій поки немає</div>
          ) : (
            <div className="events-list dashboard-scroll-area dashboard-scroll-area--log">
              {filteredEvents.map((event) => (
                <article className="event-card" key={event.id}>
                  <div className="event-card__top">
                    <div className="event-card__meta">
                      <span className={`badge badge--${mapLevelToBadge(event.level)}`}>
                        {event.level}
                      </span>
                      <span className="badge badge--muted">{event.source}</span>
                      <span className="badge badge--muted">{event.type}</span>
                    </div>

                    <time className="event-card__time">
                      {formatDateTime(event.timestamp)}
                    </time>
                  </div>

                  <div className="event-card__message">{event.message}</div>

                  {event.data ? (
                    <details className="event-card__details">
                      <summary className="event-card__details-summary">
                        Показати payload
                      </summary>
                      <pre className="event-card__data">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBoolean(value: boolean) {
  return value ? "Так" : "Ні";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function mapLevelToBadge(level: TwitchEventLogEntry["level"]) {
  if (level === "error") {
    return "danger";
  }

  if (level === "warn") {
    return "warning";
  }

  return "success";
}

function mapUsageStatus(
  status: CustomCommandUsageHistoryEntry["status"],
): "success" | "danger" | "warning" | "muted" {
  if (status === "executed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "cooldown") {
    return "warning";
  }

  return "muted";
}

function mapRewardQueueBadge(
  status: RewardQueueItem["status"],
): "success" | "warning" | "muted" {
  if (status === "processing") {
    return "warning";
  }

  return "muted";
}

function mapRewardHistoryBadge(
  status: RewardHistoryItem["status"],
): "success" | "danger" | "warning" | "muted" {
  if (status === "processed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "missing_mapping" || status === "disabled") {
    return "warning";
  }

  return "muted";
}

function safeJson(value: Record<string, unknown> | null) {
  if (!value) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
