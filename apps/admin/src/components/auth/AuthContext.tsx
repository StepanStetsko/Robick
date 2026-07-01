import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";
import {
  adminLogout,
  buildAdminLoginUrl,
  getAdminMe,
  type AdminUser,
} from "../../api/adminAuth";

type AuthContextValue = {
  user: AdminUser | null;
  loading: boolean;
  popupOpen: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [popupOpen, setPopupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const me = await getAdminMe();
      setUser(me);
    } catch {
      setUser(null);
      setError("Не вдалося звʼязатися із сервером");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();

    function handleUnauthorized() {
      setUser(null);
    }

    window.addEventListener("admin-unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("admin-unauthorized", handleUnauthorized);
    };
  }, [checkSession]);

  // Listen for the popup result + detect popup close.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // The OAuth popup is served from the API origin, not the admin origin,
      // so we identify it by the message shape rather than event.origin.
      const data = event.data as { source?: string; ok?: boolean; error?: string };
      if (data?.source !== "admin-auth") {
        return;
      }

      setPopupOpen(false);

      if (data.ok) {
        setError(null);
        void checkSession();
      } else {
        setError(data.error || "Не вдалося увійти");
      }
    }

    window.addEventListener("message", handleMessage);

    const interval = window.setInterval(() => {
      if (popupOpen && popupRef.current?.closed) {
        popupRef.current = null;
        setPopupOpen(false);
        // Re-check even if the postMessage never arrived (e.g. origin mismatch):
        // the session cookie may already be set.
        void checkSession();
      }
    }, 500);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(interval);
    };
  }, [popupOpen, checkSession]);

  const login = useCallback(() => {
    setError(null);
    const popup = window.open(
      buildAdminLoginUrl(),
      "admin-auth",
      "width=640,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes,status=no",
    );

    if (!popup) {
      setError("Браузер заблокував popup для входу через Twitch");
      return;
    }

    popupRef.current = popup;
    setPopupOpen(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminLogout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, popupOpen, error, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Guards admin-only routes: shows a spinner while the session is being checked,
 * and redirects anonymous visitors to the public guide.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="card">
          <div className="state-block">Перевірка доступу…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/guide" replace />;
  }

  return <>{children}</>;
}
