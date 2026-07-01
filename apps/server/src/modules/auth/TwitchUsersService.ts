import { env } from "../../config/env.js";
import type { TwitchUser } from "./auth.types.js";

type GetMeResponse = {
  data: TwitchUser[];
};

export class TwitchUsersService {
  async getMe(accessToken: string) {
    if (!env.TWITCH_CLIENT_ID) {
      throw new Error("TWITCH_CLIENT_ID is not set");
    }

    const response = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch Twitch user: ${response.status} ${text}`);
    }

    const data = (await response.json()) as GetMeResponse;
    const user = data.data[0];

    if (!user) {
      throw new Error("Twitch user not found");
    }

    return user;
  }
}