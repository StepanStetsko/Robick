import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { subscribeToTwitchRealtime } from "../../api/realtime";
import type { AuthStatus } from "../../types/auth";
import type { TwitchRuntimeStatus } from "../../types/twitch";

const titles: Record<string, string> = {
  "/runtime": "Стан runtime",
  "/dashboard": "Дашборд",
  "/auth": "Авторизація",
  "/commands": "Команди",
  "/channel-points": "Бали каналу",
  "/settings": "Налаштування",
};

export function Header() {
  const location = useLocation();
  const title = titles[location.pathname] ?? "Адмін-панель";

  const [runtime, setRuntime] = useState<TwitchRuntimeStatus | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToTwitchRealtime({
      onOpen: () => setStreamConnected(true),
      onError: () => setStreamConnected(false),
      onSnapshot: (snapshot) => {
        setRuntime(snapshot.runtime);
        setAuth(snapshot.auth);
      },
      onRuntimeStatus: (value) => {
        setRuntime(value);
      },
      onAuthStatus: (value) => {
        setAuth(value);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <header className="header">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">Панель керування Twitch-інтеграцією</p>
      </div>

      <div className="header__status">
        <span
          className={`badge ${streamConnected ? "badge--success" : "badge--warning"}`}
        >
          {streamConnected ? "Realtime підключено" : "Realtime відключено"}
        </span>

        <span
          className={`badge ${
            auth?.broadcaster?.connected ? "badge--success" : "badge--muted"
          }`}
        >
          Стрімер: {auth?.broadcaster?.connected ? "підключено" : "відключено"}
        </span>

        <span
          className={`badge ${auth?.bot?.connected ? "badge--success" : "badge--muted"}`}
        >
          Бот: {auth?.bot?.connected ? "підключено" : "відключено"}
        </span>

        <span
          className={`badge ${
            runtime?.broadcasterSessionConnected ? "badge--success" : "badge--warning"
          }`}
        >
          Сесія стрімера: {runtime?.broadcasterSessionConnected ? "активна" : "неактивна"}
        </span>

        <span
          className={`badge ${
            runtime?.botSessionConnected ? "badge--success" : "badge--warning"
          }`}
        >
          Сесія бота: {runtime?.botSessionConnected ? "активна" : "неактивна"}
        </span>
      </div>
    </header>
  );
}
