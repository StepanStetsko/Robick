export type SpotifySettings = {
  enabled: boolean;
  fallbackContextUri: string;
  deviceId: string;
  deviceName: string;
  configured: boolean;
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
