export const SPOTIFY_SETTINGS_KEY = "spotify";

export type SpotifySettingsDto = {
  enabled: boolean;
  fallbackContextUri: string;
  deviceId: string;
  deviceName: string;
  /** OAuth app credentials present in .env (client id/secret). */
  configured: boolean;
  /** A Spotify account is authorized (refresh token stored). */
  connected: boolean;
  connectedName: string | null;
  updatedAt: string;
};

export type UpdateSpotifySettingsInput = Partial<{
  enabled: boolean;
  fallbackContextUri: string;
  deviceId: string;
  deviceName: string;
}>;

export type SpotifyDevice = {
  id: string | null;
  name: string;
  type: string;
  isActive: boolean;
};
