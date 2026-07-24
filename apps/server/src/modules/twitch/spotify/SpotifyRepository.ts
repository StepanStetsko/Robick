import { prisma } from "../../../core/db/PrismaClient.js";
import type {
  PrismaClient,
  SpotifySettings,
} from "../../../generated/prisma/client.js";
import {
  SPOTIFY_SETTINGS_KEY,
  type UpdateSpotifySettingsInput,
} from "./spotify.types.js";

export type SpotifyTokenUpdate = {
  accessToken: string;
  refreshToken?: string; // Spotify may omit it on refresh — keep the old one
  tokenExpiresAt: Date;
  connectedName?: string | null;
};

export class SpotifyRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getSettingsRow(): Promise<SpotifySettings> {
    const existing = await this.db.spotifySettings.findUnique({
      where: { key: SPOTIFY_SETTINGS_KEY },
    });

    if (existing) {
      return existing;
    }

    return this.db.spotifySettings.create({
      data: { key: SPOTIFY_SETTINGS_KEY },
    });
  }

  async updateSettings(
    input: UpdateSpotifySettingsInput,
  ): Promise<SpotifySettings> {
    await this.getSettingsRow();

    return this.db.spotifySettings.update({
      where: { key: SPOTIFY_SETTINGS_KEY },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.fallbackContextUri !== undefined
          ? { fallbackContextUri: input.fallbackContextUri }
          : {}),
        ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
        ...(input.deviceName !== undefined
          ? { deviceName: input.deviceName }
          : {}),
      },
    });
  }

  async setTokens(input: SpotifyTokenUpdate): Promise<SpotifySettings> {
    await this.getSettingsRow();

    return this.db.spotifySettings.update({
      where: { key: SPOTIFY_SETTINGS_KEY },
      data: {
        accessToken: input.accessToken,
        tokenExpiresAt: input.tokenExpiresAt,
        ...(input.refreshToken !== undefined
          ? { refreshToken: input.refreshToken }
          : {}),
        ...(input.connectedName !== undefined
          ? { connectedName: input.connectedName }
          : {}),
      },
    });
  }

  async clearTokens(): Promise<SpotifySettings> {
    await this.getSettingsRow();

    return this.db.spotifySettings.update({
      where: { key: SPOTIFY_SETTINGS_KEY },
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        connectedName: null,
      },
    });
  }
}
