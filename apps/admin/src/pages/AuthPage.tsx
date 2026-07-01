import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthStatus, buildTwitchLoginUrl } from "../api/auth";
import { subscribeToTwitchRealtime } from "../api/realtime";
import type {
  AuthAccountStatus,
  AuthAccountType,
  AuthStatus,
} from "../types/auth";

type AuthPopupMessage = {
  source?: string;
  ok?: boolean;
  error?: string;
  accountType?: AuthAccountType;
  login?: string;
  displayName?: string;
};

export function AuthPage() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamConnected, setStreamConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popupState, setPopupState] = useState<{
    open: boolean;
    accountType: AuthAccountType | null;
  }>({
    open: false,
    accountType: null,
  });

  const popupRef = useRef<Window | null>(null);

  const connectedCount = useMemo(() => {
    if (!status) {
      return 0;
    }

    return [status.broadcaster, status.bot].filter((item) => item.connected).length;
  }, [status]);

  async function loadStatus() {
    setError(null);

    try {
      const result = await getAuthStatus();
      setStatus(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося отримати статус авторизації",
      );
    } finally {
      setLoading(false);
    }
  }

  function openLoginPopup(accountType: AuthAccountType) {
    setError(null);

    const popup = window.open(
      buildTwitchLoginUrl(accountType),
      `twitch-auth-${accountType}`,
      "width=640,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes,status=no",
    );

    if (!popup) {
      setError("Браузер заблокував popup для авторизації Twitch");
      return;
    }

    popupRef.current = popup;
    setPopupState({
      open: true,
      accountType,
    });
  }

  useEffect(() => {
    void loadStatus();

    const unsubscribe = subscribeToTwitchRealtime({
      onOpen: () => {
        setStreamConnected(true);
      },
      onError: () => {
        setStreamConnected(false);
      },
      onSnapshot: (snapshot) => {
        setStatus(snapshot.auth);
        setLoading(false);
      },
      onAuthStatus: (nextStatus) => {
        setStatus(nextStatus);
        setLoading(false);
      },
    });

    function handleMessage(event: MessageEvent<AuthPopupMessage>) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.source !== "twitch-auth") {
        return;
      }

      setPopupState({
        open: false,
        accountType: null,
      });

      if (!event.data.ok) {
        setError(event.data.error || "Авторизація Twitch завершилась з помилкою");
      }
    }

    window.addEventListener("message", handleMessage);

    const interval = window.setInterval(() => {
      const popup = popupRef.current;

      if (!popupState.open || !popup) {
        return;
      }

      if (popup.closed) {
        popupRef.current = null;
        setPopupState({
          open: false,
          accountType: null,
        });
      }
    }, 500);

    return () => {
      unsubscribe();
      window.removeEventListener("message", handleMessage);
      window.clearInterval(interval);
    };
  }, [popupState.open]);

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Авторизація Twitch</h2>
            <p className="card__subtitle">
              Підключення акаунта стрімера і бота до Twitch OAuth
            </p>
          </div>

          <span
            className={`badge ${streamConnected ? "badge--success" : "badge--warning"}`}
          >
            {streamConnected ? "Realtime підключено" : "Realtime відключено"}
          </span>
        </div>

        {error ? <div className="state-block state-block--error">{error}</div> : null}

        <div className="status-grid">
          <div className="status-item">
            <span className="status-item__label">Підключені акаунти</span>
            <strong>{status ? `${connectedCount}/2` : "—"}</strong>
          </div>

          <div className="status-item">
            <span className="status-item__label">Стан popup-вікна</span>
            <strong>
              {popupState.open && popupState.accountType
                ? `Очікування авторизації: ${popupState.accountType}`
                : "Очікування"}
            </strong>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="state-block">Завантаження статусу авторизації...</div>
        </div>
      ) : status ? (
        <div className="page-columns">
          <AuthAccountCard
            title="Стрімер"
            accountType="broadcaster"
            status={status.broadcaster}
            connectDisabled={popupState.open}
            onConnect={openLoginPopup}
          />

          <AuthAccountCard
            title="Бот"
            accountType="bot"
            status={status.bot}
            connectDisabled={popupState.open}
            onConnect={openLoginPopup}
          />
        </div>
      ) : (
        <div className="card">
          <div className="state-block">Статус авторизації недоступний</div>
        </div>
      )}

      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Сира відповідь</h2>
            <p className="card__subtitle">Сирий JSON для дебагу</p>
          </div>
        </div>

        <pre className="code-block">{JSON.stringify(status, null, 2)}</pre>
      </div>
    </div>
  );
}

type AuthAccountCardProps = {
  title: string;
  accountType: AuthAccountType;
  status: AuthAccountStatus;
  connectDisabled: boolean;
  onConnect: (accountType: AuthAccountType) => void;
};

function AuthAccountCard({
  title,
  accountType,
  status,
  connectDisabled,
  onConnect,
}: AuthAccountCardProps) {
  return (
    <div className="card">
      <div className="card__header">
        <div>
          <h2 className="card__title">{title}</h2>
          <p className="card__subtitle">
            {accountType === "broadcaster"
              ? "Головний акаунт стрімера"
              : "Окремий акаунт бота"}
          </p>
        </div>

        <div className="actions">
          <button
            className="button button--primary"
            onClick={() => onConnect(accountType)}
            disabled={connectDisabled}
          >
            Підключити
          </button>
        </div>
      </div>

      <div className="status-grid">
        <div className="status-item">
          <span className="status-item__label">Підключено</span>
          <strong>{status.connected ? "Так" : "Ні"}</strong>
        </div>

        <div className="status-item">
          <span className="status-item__label">Логін</span>
          <strong>{status.connected ? status.login : "—"}</strong>
        </div>

        <div className="status-item">
          <span className="status-item__label">Відображуване ім’я</span>
          <strong>{status.connected ? status.displayName : "—"}</strong>
        </div>

        <div className="status-item">
          <span className="status-item__label">ID користувача провайдера</span>
          <strong>{status.connected ? status.providerUserId : "—"}</strong>
        </div>

        <div className="status-item">
          <span className="status-item__label">Дійсне до</span>
          <strong>{status.connected ? formatDateTime(status.expiresAt) : "—"}</strong>
        </div>

        <div className="status-item">
          <span className="status-item__label">Кількість scope</span>
          <strong>{status.connected ? status.scopes.length : "—"}</strong>
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field__label">Права доступу</label>
        <div className="state-block">
          {status.connected && status.scopes.length > 0
            ? status.scopes.join(", ")
            : "Немає scope"}
        </div>
      </div>
    </div>
  );
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
