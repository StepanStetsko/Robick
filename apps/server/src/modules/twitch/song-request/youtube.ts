import { logger } from "../../../core/logger/logger.js";

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract a YouTube video id from the common URL shapes (watch, youtu.be,
 * shorts, embed, music) or a bare 11-char id. Returns null if not a YouTube
 * video link.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim();

  if (VIDEO_ID_RE.test(raw)) {
    return raw;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    const vParam = url.searchParams.get("v");
    if (vParam && VIDEO_ID_RE.test(vParam)) {
      return vParam;
    }

    // /shorts/ID, /embed/ID, /live/ID
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      segments.length >= 2 &&
      ["shorts", "embed", "live", "v"].includes(segments[0])
    ) {
      return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
    }
  }

  return null;
}

export function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export type YouTubeOEmbed = {
  title: string | null;
  thumbnailUrl: string | null;
};

/**
 * Keyless metadata via YouTube oEmbed — gives title + thumbnail (no duration or
 * embeddable flag; those need the Data API). Best-effort: never throws.
 */
export async function fetchYouTubeOEmbed(
  videoId: string,
): Promise<YouTubeOEmbed> {
  const fallback: YouTubeOEmbed = {
    title: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      canonicalYouTubeUrl(videoId),
    )}&format=json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as {
      title?: unknown;
      thumbnail_url?: unknown;
    };

    return {
      title: typeof data.title === "string" ? data.title : fallback.title,
      thumbnailUrl:
        typeof data.thumbnail_url === "string"
          ? data.thumbnail_url
          : fallback.thumbnailUrl,
    };
  } catch (error: unknown) {
    logger.warn("YouTube oEmbed fetch failed", error);
    return fallback;
  }
}
