import { useEffect, useRef, useState } from "react";
import { NowPlayingCard } from "../components/NowPlayingCard";

// Public OBS overlay: plays the song-request queue in order via the YouTube
// IFrame Player API, but shows a minimalist "now playing" music card instead of
// the video (the player is kept in the DOM, hidden, so only the audio is heard).
// Reads pause / skip-vote state from the server so mods & chat can control it.
// Add as a Browser Source in OBS pointing at /overlay/player. Uses plain fetch
// against the public (no-auth) endpoints — no admin cookie.

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

const STATE_POLL_MS = 700;
const PROGRESS_POLL_MS = 500;

type SongDto = {
  id: string;
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  requestedBy: string | null;
};

type OverlayState = {
  current: SongDto | null;
  paused: boolean;
  skipVotes: number;
  skipVotesNeeded: number;
};

// Minimal shape of the YouTube IFrame Player we use.
type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        options: Record<string, unknown>,
      ) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

async function fetchState(): Promise<OverlayState | null> {
  const res = await fetch(`${API_BASE}/api/public/song-queue/state`);
  const json = (await res.json()) as { ok: boolean; data: OverlayState | null };
  return json.data ?? null;
}

async function advance(): Promise<SongDto | null> {
  const res = await fetch(`${API_BASE}/api/public/song-queue/advance`, {
    method: "POST",
  });
  const json = (await res.json()) as {
    ok: boolean;
    data: { current: SongDto | null };
  };
  return json.data?.current ?? null;
}

export function OverlayPlayerPage() {
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedVideoId = useRef<string | null>(null);
  const appliedPaused = useRef(false);
  const [nowPlaying, setNowPlaying] = useState<SongDto | null>(null);
  const [paused, setPaused] = useState(false);
  const [skipVotes, setSkipVotes] = useState(0);
  const [skipNeeded, setSkipNeeded] = useState(0);
  const [progress, setProgress] = useState(0);
  const nowPlayingRef = useRef<SongDto | null>(null);

  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  // The admin app paints a gradient on <body>; force it transparent here so the
  // OBS browser source shows only the card over the live scene.
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  useEffect(() => {
    let stateTimer: ReturnType<typeof setInterval> | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    function applySong(song: SongDto | null) {
      if (disposed) {
        return;
      }
      setNowPlaying(song);

      if (song && song.videoId !== loadedVideoId.current) {
        loadedVideoId.current = song.videoId;
        appliedPaused.current = false; // loadVideoById autoplays
        setProgress(0);
        playerRef.current?.loadVideoById(song.videoId);
      } else if (!song) {
        loadedVideoId.current = null;
        setProgress(0);
      }
    }

    function applyPause(next: boolean) {
      setPaused(next);
      const player = playerRef.current;
      if (!player || next === appliedPaused.current) {
        return;
      }
      appliedPaused.current = next;
      try {
        if (next) {
          player.pauseVideo();
        } else {
          player.playVideo();
        }
      } catch {
        // player not ready yet — the next poll will retry
      }
    }

    async function syncState() {
      try {
        const state = await fetchState();
        if (!state || disposed) {
          return;
        }
        applySong(state.current);
        applyPause(state.paused);
        setSkipVotes(state.skipVotes);
        setSkipNeeded(state.skipVotesNeeded);
      } catch {
        // ignore — retried on the next tick
      }
    }

    async function onEnded() {
      try {
        applySong(await advance());
      } catch {
        // Network blip — the state poll will recover.
      }
    }

    function pollProgress() {
      const player = playerRef.current;
      if (!player || !nowPlayingRef.current) {
        return;
      }
      try {
        const duration = player.getDuration();
        const current = player.getCurrentTime();
        if (duration > 0) {
          setProgress(current / duration);
        }
      } catch {
        // player not ready yet
      }
    }

    function createPlayer() {
      if (!window.YT) {
        return;
      }
      playerRef.current = new window.YT.Player("yt-player", {
        width: "100%",
        height: "100%",
        // Pin the host + origin so the IFrame JS API works on a real domain
        // (over HTTPS). Without an explicit origin, playVideo/loadVideoById can
        // be silently ignored once the overlay is served from adm.<domain>.
        host: "https://www.youtube.com",
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => void syncState(),
          onStateChange: (event: { data: number }) => {
            if (event.data === window.YT?.PlayerState.ENDED) {
              void onEnded();
            }
          },
          onError: (event: { data: number }) => {
            // eslint-disable-next-line no-console
            console.error("[overlay] YouTube player error", event.data);
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.getElementById("yt-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    stateTimer = setInterval(() => void syncState(), STATE_POLL_MS);
    progressTimer = setInterval(pollProgress, PROGRESS_POLL_MS);

    return () => {
      disposed = true;
      if (stateTimer) {
        clearInterval(stateTimer);
      }
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        overflow: "hidden",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      {/* Hidden YouTube player — kept in the DOM so the audio keeps playing. */}
      <div
        style={{
          position: "absolute",
          width: 2,
          height: 2,
          left: 0,
          bottom: 0,
          opacity: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div id="yt-player" />
      </div>

      <NowPlayingCard
        title={nowPlaying?.title ?? null}
        thumbnailUrl={nowPlaying?.thumbnailUrl ?? null}
        requestedBy={nowPlaying?.requestedBy ?? null}
        progress={progress}
        idle={!nowPlaying}
        paused={paused}
        skipVotes={skipVotes}
        skipNeeded={skipNeeded}
      />
    </div>
  );
}
