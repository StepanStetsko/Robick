import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),

  ADMIN_BASE_URL: z.string().url().default("http://localhost:5173"),

  TWITCH_CLIENT_ID: z.string().min(1, "TWITCH_CLIENT_ID is required"),
  TWITCH_CLIENT_SECRET: z.string().min(1, "TWITCH_CLIENT_SECRET is required"),
  TWITCH_REDIRECT_URI: z.string().url("TWITCH_REDIRECT_URI must be a valid URL"),

  TWITCH_BROADCASTER_SCOPES: z
    .string()
    .default(
      "user:read:chat channel:read:redemptions moderator:read:followers channel:read:subscriptions bits:read moderator:read:chatters",
    ),

  TWITCH_BOT_SCOPES: z
    .string()
    .default("user:read:chat user:write:chat"),

  // --- Admin panel access control (Twitch login + allowlist) ---
  // Comma/space separated Twitch logins allowed into the admin panel.
  ADMIN_ALLOWED_LOGINS: z.string().default(""),
  // HMAC secret used to sign stateless admin session cookies. Required.
  ADMIN_SESSION_SECRET: z
    .string()
    .min(16, "ADMIN_SESSION_SECRET must be at least 16 characters"),
  // Admin session lifetime in hours (default: 7 days).
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),

  // Donatello «Колбеки» shared secret (X-Key header). Empty = webhook disabled.
  DONATELLO_WEBHOOK_KEY: z.string().default(""),

  // --- Spotify Connect fallback (OAuth app credentials) ---
  // From developer.spotify.com dashboard. Empty = Spotify integration disabled.
  SPOTIFY_CLIENT_ID: z.string().default(""),
  SPOTIFY_CLIENT_SECRET: z.string().default(""),
  // Must match a Redirect URI registered in the Spotify app. Empty = derived
  // from ADMIN_BASE_URL + /api/auth/spotify/callback.
  SPOTIFY_REDIRECT_URI: z.string().default(""),

  STORAGE_DIR: z.string().default("./storage"),

  UNREAL_WS_PORT: z.coerce.number().int().positive().default(4101),
  UNREAL_WS_HOST: z.string().default("127.0.0.1"),

  UNITY_WS_PORT: z.coerce.number().int().positive().default(4102),
  UNITY_WS_HOST: z.string().default("127.0.0.1"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const broadcasterScopes = env.TWITCH_BROADCASTER_SCOPES.split(/\s+/).filter(
  Boolean,
);

export const botScopes = env.TWITCH_BOT_SCOPES.split(/\s+/).filter(Boolean);

// Normalized lowercase allowlist of Twitch logins permitted into the admin panel.
// Tolerant of stray quotes and a leading "@" (Twitch logins have neither).
export const adminAllowedLogins = env.ADMIN_ALLOWED_LOGINS.split(/[\s,]+/)
  .map((login) =>
    login
      .trim()
      .replace(/["']/g, "")
      .replace(/^@+/, "")
      .toLowerCase(),
  )
  .filter(Boolean);

if (adminAllowedLogins.length === 0) {
  console.warn(
    "[auth] ADMIN_ALLOWED_LOGINS is empty — nobody will be able to log into the admin panel.",
  );
} else {
  console.log(
    `[auth] admin allowlist loaded (${adminAllowedLogins.length}): ${adminAllowedLogins.join(", ")}`,
  );
}
