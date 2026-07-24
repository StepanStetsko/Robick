import { randomBytes } from "node:crypto";
import { env } from "../../../config/env.js";
import { logger } from "../../../core/logger/logger.js";
import { SpotifyRepository } from "./SpotifyRepository.js";
import {
  type SpotifyDevice,
  type SpotifySettingsDto,
  type UpdateSpotifySettingsInput,
} from "./spotify.types.js";
import type { SpotifySettings } from "../../../generated/prisma/client.js";

const SETTINGS_TTL_MS = 15_000;
const ACCOUNTS_BASE = "https://accounts.spotify.com";
const API_BASE = "https://api.spotify.com/v1";
const SCOPES = "user-read-playback-state user-modify-playback-state";
// Pause the fallback if the overlay (OBS source) hasn't polled for this long.
const OVERLAY_TIMEOUT_MS = 6_000;
const TOKEN_EARLY_REFRESH_MS = 60_000;
const PLAY_RETRY_MS = 5_000;

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type PlaybackAction = "play" | "pause";

export type OverlaySignal = {
  hasCurrentYouTube: boolean;
  paused: boolean;
};

export class SpotifyService {
  private settingsCache: { row: SpotifySettings; at: number } | null = null;
  private readonly oauthStates = new Map<string, number>();

  // Fallback coordinator state (in-memory).
  private lastAction: PlaybackAction | null = null;
  private fallbackLoaded = false;
  private active = false;
  private applying = false;
  private lastOverlaySeenAt = 0;
  private nextPlayRetryAt = 0;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly repo: SpotifyRepository) {}

  // ----- Config / status -----

  isConfigured(): boolean {
    return Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET);
  }

  private redirectUri(): string {
    return (
      env.SPOTIFY_REDIRECT_URI ||
      `${env.ADMIN_BASE_URL}/api/auth/spotify/callback`
    );
  }

  private async getRow(): Promise<SpotifySettings> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCache.at < SETTINGS_TTL_MS) {
      return this.settingsCache.row;
    }
    const row = await this.repo.getSettingsRow();
    this.settingsCache = { row, at: now };
    return row;
  }

  async getSettings(): Promise<SpotifySettingsDto> {
    const row = await this.getRow();
    return toDto(row, this.isConfigured());
  }

  async updateSettings(
    input: UpdateSpotifySettingsInput,
  ): Promise<SpotifySettingsDto> {
    const normalized: UpdateSpotifySettingsInput = {
      ...input,
      ...(input.fallbackContextUri !== undefined
        ? { fallbackContextUri: input.fallbackContextUri.trim() }
        : {}),
      ...(input.deviceId !== undefined
        ? { deviceId: input.deviceId.trim() }
        : {}),
    };

    await this.repo.updateSettings(normalized);
    this.settingsCache = null;
    // A config change re-evaluates playback from scratch.
    this.resetCoordinator();
    return this.getSettings();
  }

  // ----- OAuth -----

  buildAuthUrl(): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET is not set");
    }

    this.pruneStates();
    const state = randomBytes(16).toString("hex");
    this.oauthStates.set(state, Date.now() + 10 * 60_000);

    const url = new URL(`${ACCOUNTS_BASE}/authorize`);
    url.searchParams.set("client_id", env.SPOTIFY_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("show_dialog", "true");

    return { url: url.toString(), state };
  }

  /** Exchange the callback code for tokens and store them. Returns display name. */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<string | null> {
    if (!code) {
      throw new Error("Missing authorization code");
    }
    if (!state || !this.oauthStates.has(state)) {
      throw new Error("Invalid or expired state");
    }
    this.oauthStates.delete(state);

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", this.redirectUri());

    const token = await this.tokenRequest(body);
    const displayName = await this.fetchDisplayName(token.access_token);

    await this.repo.setTokens({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      connectedName: displayName,
    });
    this.settingsCache = null;
    this.resetCoordinator();
    return displayName;
  }

  async disconnect(): Promise<void> {
    await this.repo.clearTokens();
    this.settingsCache = null;
    this.resetCoordinator();
  }

  private async tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
    const basic = Buffer.from(
      `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await fetch(`${ACCOUNTS_BASE}/api/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify token request failed: ${response.status} ${text}`);
    }

    return (await response.json()) as TokenResponse;
  }

  private async fetchDisplayName(accessToken: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as { display_name?: unknown };
      return typeof data.display_name === "string" ? data.display_name : null;
    } catch {
      return null;
    }
  }

  /** Returns a valid access token, refreshing if needed. null = not connected. */
  private async getAccessToken(): Promise<string | null> {
    const row = await this.repo.getSettingsRow();
    if (!row.refreshToken) {
      return null;
    }

    const stillValid =
      row.accessToken &&
      row.tokenExpiresAt &&
      row.tokenExpiresAt.getTime() - Date.now() > TOKEN_EARLY_REFRESH_MS;

    if (stillValid && row.accessToken) {
      return row.accessToken;
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.refreshToken(row.refreshToken).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async refreshToken(refreshToken: string): Promise<string | null> {
    try {
      const body = new URLSearchParams();
      body.set("grant_type", "refresh_token");
      body.set("refresh_token", refreshToken);

      const token = await this.tokenRequest(body);
      await this.repo.setTokens({
        accessToken: token.access_token,
        refreshToken: token.refresh_token, // may be undefined → keeps old one
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      });
      this.settingsCache = null;
      return token.access_token;
    } catch (error: unknown) {
      logger.warn("Spotify token refresh failed", error);
      return null;
    }
  }

  // ----- Web API -----

  async getDevices(): Promise<SpotifyDevice[]> {
    const token = await this.getAccessToken();
    if (!token) {
      return [];
    }

    const res = await fetch(`${API_BASE}/me/player/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as {
      devices?: Array<{
        id?: string | null;
        name?: string;
        type?: string;
        is_active?: boolean;
      }>;
    };

    return (data.devices ?? []).map((d) => ({
      id: d.id ?? null,
      name: d.name ?? "—",
      type: d.type ?? "",
      isActive: Boolean(d.is_active),
    }));
  }

  // ----- Fallback coordinator -----

  /** Whether the Spotify fallback is currently the active audio source. */
  isFallbackActive(): boolean {
    return this.active;
  }

  private resetCoordinator(): void {
    this.lastAction = null;
    this.fallbackLoaded = false;
    this.active = false;
    this.nextPlayRetryAt = 0;
  }

  /**
   * Called from the overlay's /state poll. Decides whether Spotify should be
   * playing the fallback (queue idle & not paused) or paused (a requested song
   * is playing, or global pause). Edge-triggered — only hits the API on change.
   */
  async syncFromOverlay(signal: OverlaySignal): Promise<void> {
    this.lastOverlaySeenAt = Date.now();

    const settings = await this.getSettings();
    if (!settings.enabled || !settings.connected) {
      return;
    }

    const desired: PlaybackAction =
      signal.paused || signal.hasCurrentYouTube ? "pause" : "play";
    await this.applyAction(desired);
  }

  /** Interval watchdog: pause the fallback if the overlay went away (OBS closed). */
  async tickWatchdog(): Promise<void> {
    if (!this.active) {
      return;
    }
    if (Date.now() - this.lastOverlaySeenAt > OVERLAY_TIMEOUT_MS) {
      await this.applyAction("pause");
    }
  }

  private async applyAction(action: PlaybackAction): Promise<void> {
    if (action === this.lastAction || this.applying) {
      return;
    }
    if (action === "play" && Date.now() < this.nextPlayRetryAt) {
      return;
    }

    this.applying = true;
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return;
      }
      const row = await this.getRow();
      const deviceQuery = row.deviceId
        ? `?device_id=${encodeURIComponent(row.deviceId)}`
        : "";

      if (action === "play") {
        const useContext = !this.fallbackLoaded && Boolean(row.fallbackContextUri);
        const res = await fetch(`${API_BASE}/me/player/play${deviceQuery}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: useContext
            ? JSON.stringify({ context_uri: row.fallbackContextUri })
            : undefined,
        });

        if (res.ok || res.status === 204) {
          this.lastAction = "play";
          this.active = true;
          if (useContext) {
            this.fallbackLoaded = true;
          }
        } else {
          this.nextPlayRetryAt = Date.now() + PLAY_RETRY_MS;
          const text = await res.text().catch(() => "");
          logger.warn(
            `Spotify play failed: ${res.status} ${text} (device: ${
              row.deviceName || row.deviceId || "active"
            })`,
          );
        }
      } else {
        const res = await fetch(`${API_BASE}/me/player/pause${deviceQuery}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
        });
        // 404 = nothing was playing → treat as already-paused.
        if (res.ok || res.status === 204 || res.status === 404) {
          this.lastAction = "pause";
          this.active = false;
        } else {
          const text = await res.text().catch(() => "");
          logger.warn(`Spotify pause failed: ${res.status} ${text}`);
        }
      }
    } catch (error: unknown) {
      logger.warn("Spotify applyAction error", error);
    } finally {
      this.applying = false;
    }
  }

  private pruneStates(): void {
    const now = Date.now();
    for (const [state, expiry] of this.oauthStates) {
      if (expiry < now) {
        this.oauthStates.delete(state);
      }
    }
  }
}

function toDto(row: SpotifySettings, configured: boolean): SpotifySettingsDto {
  return {
    enabled: row.enabled,
    fallbackContextUri: row.fallbackContextUri,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    configured,
    connected: Boolean(row.refreshToken),
    connectedName: row.connectedName,
    updatedAt: row.updatedAt.toISOString(),
  };
}
