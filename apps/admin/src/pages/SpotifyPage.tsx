import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  disconnectSpotify,
  getSpotifyDevices,
  getSpotifySettings,
  updateSpotifySettings,
} from "../api/spotify";
import type { SpotifyDevice, SpotifySettings } from "../types/spotify";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.trim() || window.location.origin;

type FormState = {
  enabled: boolean;
  fallbackContextUri: string;
  deviceId: string;
  deviceName: string;
};

function settingsToForm(s: SpotifySettings): FormState {
  return {
    enabled: s.enabled,
    fallbackContextUri: s.fallbackContextUri,
    deviceId: s.deviceId,
    deviceName: s.deviceName,
  };
}

export function SpotifyPage() {
  const [settings, setSettings] = useState<SpotifySettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getSpotifySettings();
      setSettings(s);
      setForm(settingsToForm(s));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не вдалося завантажити налаштування",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Listen for the OAuth popup result, then reload the connection state.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { source?: string; ok?: boolean; error?: string };
      if (!data || data.source !== "spotify-auth") {
        return;
      }
      if (data.ok) {
        void load();
      } else {
        setError(`Spotify: ${data.error ?? "не вдалося підключити"}`);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  function connect() {
    setError(null);
    popupRef.current = window.open(
      `${API_BASE}/api/auth/spotify/login`,
      "spotify-oauth",
      "width=520,height=720",
    );
  }

  async function handleDisconnect() {
    try {
      const s = await disconnectSpotify();
      setSettings(s);
      setForm(settingsToForm(s));
      setDevices([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося відключити");
    }
  }

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      setDevices(await getSpotifyDevices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося отримати пристрої");
    } finally {
      setLoadingDevices(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) {
      return;
    }
    setSaving(true);
    setSubmitError(null);
    setSavedAt(null);
    try {
      const updated = await updateSpotifySettings(form);
      setSettings(updated);
      setForm(settingsToForm(updated));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  function setValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function selectDevice(id: string) {
    const device = devices.find((d) => (d.id ?? "") === id);
    setForm((current) =>
      current
        ? { ...current, deviceId: id, deviceName: device?.name ?? "" }
        : current,
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Spotify (фонова музика)</h2>
            <p className="card__subtitle">
              Коли черга замовлених пісень порожня, бот вмикає плейлист у твоєму
              десктопному Spotify. Замовлена пісня / пауза — Spotify зупиняється.
              Звук лови в OBS через Desktop/Application Audio.
            </p>
          </div>
        </div>

        {loading ? <div className="state-block">Завантаження...</div> : null}
        {error ? (
          <div className="state-block state-block--error">{error}</div>
        ) : null}

        {settings && form ? (
          <>
            {/* Connection status */}
            {!settings.configured ? (
              <div className="tab-panel__intro" style={{ color: "#ffcf99" }}>
                Заповни у <code>.env</code> сервера{" "}
                <code>SPOTIFY_CLIENT_ID</code> та{" "}
                <code>SPOTIFY_CLIENT_SECRET</code> (з developer.spotify.com), і
                додай Redirect URI{" "}
                <code>{`${API_BASE}/api/auth/spotify/callback`}</code> у
                налаштуваннях застосунку Spotify. Потрібен акаунт{" "}
                <strong>Spotify Premium</strong>.
              </div>
            ) : settings.connected ? (
              <div
                className="tab-panel__intro"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  ✓ Підключено як{" "}
                  <strong>{settings.connectedName ?? "Spotify"}</strong>
                </span>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => void handleDisconnect()}
                >
                  Відключити
                </button>
              </div>
            ) : (
              <div
                className="tab-panel__intro"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span>Акаунт Spotify не підключено.</span>
                <button
                  type="button"
                  className="button button--primary button--small"
                  onClick={connect}
                >
                  Підключити Spotify
                </button>
              </div>
            )}

            <form className="form" onSubmit={handleSave}>
              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setValue("enabled", e.target.checked)}
                  disabled={saving}
                />
                <span>Фонову музику Spotify увімкнено</span>
              </label>

              <label className="field">
                <span className="field__label">
                  Плейлист / альбом для фону (Spotify URI або посилання)
                </span>
                <input
                  className="field__input"
                  value={form.fallbackContextUri}
                  onChange={(e) =>
                    setValue("fallbackContextUri", e.target.value)
                  }
                  disabled={saving}
                  placeholder="spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
                />
                <span className="field__hint">
                  напр. <code>spotify:playlist:...</code> — правий клік на
                  плейлисті → Поділитися → Копіювати посилання Spotify URI.
                  Порожньо = бот просто відновлює те, що зараз у твоєму Spotify.
                </span>
              </label>

              <label className="field">
                <span className="field__label">Пристрій відтворення</span>
                <select
                  className="field__input"
                  value={form.deviceId}
                  onChange={(e) => selectDevice(e.target.value)}
                  disabled={saving}
                >
                  <option value="">
                    Активний пристрій (авто){form.deviceName ? "" : ""}
                  </option>
                  {devices.map((d) => (
                    <option key={d.id ?? d.name} value={d.id ?? ""}>
                      {d.name} ({d.type}){d.isActive ? " • активний" : ""}
                    </option>
                  ))}
                  {form.deviceId &&
                  !devices.some((d) => (d.id ?? "") === form.deviceId) ? (
                    <option value={form.deviceId}>
                      {form.deviceName || form.deviceId} (збережений)
                    </option>
                  ) : null}
                </select>
                <span
                  className="field__hint"
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  Spotify має бути відкритий на цьому ПК, щоб пристрій зʼявився.
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => void loadDevices()}
                    disabled={loadingDevices || !settings.connected}
                  >
                    {loadingDevices ? "Оновлення..." : "Оновити пристрої"}
                  </button>
                </span>
              </label>

              <div className="form__footer">
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Збереження..." : "Зберегти"}
                </button>
                {submitError ? (
                  <span className="field__hint" style={{ color: "#ffb5b2" }}>
                    {submitError}
                  </span>
                ) : savedAt ? (
                  <span className="field__hint">Збережено о {savedAt}</span>
                ) : null}
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
