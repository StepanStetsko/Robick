import { useEffect, useRef, useState } from "react";
import { NowPlayingCard } from "../components/NowPlayingCard";

// Public OBS overlay: plays the song-request queue in order via the YouTube
// IFrame Player API, showing a minimalist "now playing" card (the player is
// hidden, so only the audio is heard). When the queue is empty it falls back to
// a YouTube "mix" (radio) seeded in settings — endless auto-recommended tracks —
// and skips any track that matches the block keywords / blocklist (e.g. Russian
// songs). Add as a Browser Source in OBS pointing at /overlay/player.

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

type FallbackConfig = {
  enabled: boolean;
  mixListId: string | null;
  blockKeywords: string[];
  blockedVideoIds: string[];
};

type OverlayState = {
  current: SongDto | null;
  paused: boolean;
  skipVotes: number;
  skipVotesNeeded: number;
  fallback: FallbackConfig;
};

type VideoData = { video_id?: string; title?: string; author?: string };

type YTPlayer = {
  loadVideoById: (videoId: string) => void;
  loadPlaylist: (options: {
    list: string;
    listType: string;
    index?: number;
  }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  nextVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoData: () => VideoData;
  getPlaylistIndex: () => number;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        options: Record<string, unknown>,
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number };
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

function reportFallback(track: VideoData | null): void {
  void fetch(`${API_BASE}/api/public/song-queue/fallback-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      track
        ? {
            videoId: track.video_id ?? "",
            title: track.title ?? null,
            author: track.author ?? null,
          }
        : { videoId: "" },
    ),
  }).catch(() => {
    // best-effort — retried on the next track change
  });
}

type DisplayTrack = {
  title: string | null;
  thumbnailUrl: string | null;
  requestedBy: string | null;
  fallback: boolean;
};

export function OverlayPlayerPage() {
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedVideoId = useRef<string | null>(null);
  const loadedMixListId = useRef<string | null>(null);
  // Where we were in the mix, so re-entering the fallback resumes there instead
  // of restarting from the first track every time a request interrupts it.
  const mixIndexRef = useRef(0);
  const appliedPaused = useRef(false);
  const pausedRef = useRef(true);
  const modeRef = useRef<"queue" | "fallback" | "idle">("idle");
  const fallbackRef = useRef<FallbackConfig | null>(null);
  const reportedVideoId = useRef<string | null>(null);
  const [display, setDisplay] = useState<DisplayTrack | null>(null);
  const [paused, setPaused] = useState(true);
  const [skipVotes, setSkipVotes] = useState(0);
  const [skipNeeded, setSkipNeeded] = useState(0);
  const [progress, setProgress] = useState(0);

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

    function isBlocked(data: VideoData): boolean {
      const cfg = fallbackRef.current;
      if (!cfg) {
        return false;
      }
      if (data.video_id && cfg.blockedVideoIds.includes(data.video_id)) {
        return true;
      }
      const haystack = `${data.title ?? ""} ${data.author ?? ""}`.toLowerCase();
      return cfg.blockKeywords.some((kw) => kw && haystack.includes(kw));
    }

    function playQueueSong(song: SongDto) {
      // Leaving the radio for a request → advance our mix position so the next
      // time the fallback resumes it won't replay the same track.
      if (modeRef.current === "fallback") {
        mixIndexRef.current += 1;
      }
      modeRef.current = "queue";
      loadedMixListId.current = null;
      if (reportedVideoId.current) {
        reportedVideoId.current = null;
        reportFallback(null);
      }
      setDisplay({
        title: song.title,
        thumbnailUrl: song.thumbnailUrl,
        requestedBy: song.requestedBy,
        fallback: false,
      });
      if (song.videoId !== loadedVideoId.current) {
        loadedVideoId.current = song.videoId;
        appliedPaused.current = false; // loadVideoById autoplays
        setProgress(0);
        playerRef.current?.loadVideoById(song.videoId);
      }
    }

    function startFallback(mixListId: string) {
      modeRef.current = "fallback";
      loadedVideoId.current = null;
      if (mixListId !== loadedMixListId.current) {
        loadedMixListId.current = mixListId;
        appliedPaused.current = false;
        setProgress(0);
        // Resume near where the mix left off (not always the first track).
        playerRef.current?.loadPlaylist({
          list: mixListId,
          listType: "playlist",
          index: Math.max(0, mixIndexRef.current),
        });
      }
    }

    function goIdle() {
      modeRef.current = "idle";
      loadedVideoId.current = null;
      loadedMixListId.current = null;
      setProgress(0);
      setDisplay(null);
      if (reportedVideoId.current) {
        reportedVideoId.current = null;
        reportFallback(null);
      }
    }

    function applyPause(next: boolean) {
      setPaused(next);
      pausedRef.current = next;
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

    /** In fallback mode: skip blocked tracks, else publish the current one. */
    function handleFallbackTrack() {
      const player = playerRef.current;
      if (!player || modeRef.current !== "fallback") {
        return;
      }
      let data: VideoData;
      try {
        data = player.getVideoData();
      } catch {
        return;
      }
      if (!data.video_id) {
        return;
      }
      if (isBlocked(data)) {
        try {
          player.nextVideo();
        } catch {
          // ignore
        }
        return;
      }
      // Remember our spot in the mix so a later re-entry resumes here.
      try {
        const idx = player.getPlaylistIndex();
        if (typeof idx === "number" && idx >= 0) {
          mixIndexRef.current = idx;
        }
      } catch {
        // ignore
      }
      setDisplay({
        title: data.title ?? null,
        thumbnailUrl: `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`,
        requestedBy: null,
        fallback: true,
      });
      if (data.video_id !== reportedVideoId.current) {
        reportedVideoId.current = data.video_id;
        reportFallback(data);
      }
    }

    async function syncState() {
      try {
        const state = await fetchState();
        if (!state || disposed) {
          return;
        }
        fallbackRef.current = state.fallback;
        setSkipVotes(state.skipVotes);
        setSkipNeeded(state.skipVotesNeeded);
        applyPause(state.paused);

        if (state.current) {
          playQueueSong(state.current);
        } else if (state.fallback.enabled && state.fallback.mixListId) {
          // Stay in fallback mode even while paused (applyPause holds the
          // player); only skip/report when actually playing.
          startFallback(state.fallback.mixListId);
          if (!state.paused) {
            // Re-check the current mix track against an updated blocklist.
            handleFallbackTrack();
          }
        } else {
          goIdle();
        }
      } catch {
        // ignore — retried on the next tick
      }
    }

    async function onEnded() {
      if (modeRef.current === "fallback") {
        try {
          playerRef.current?.nextVideo();
        } catch {
          // ignore
        }
        return;
      }
      try {
        const next = await advance();
        if (next) {
          playQueueSong(next);
        }
      } catch {
        // Network blip — the state poll will recover.
      }
    }

    function pollProgress() {
      const player = playerRef.current;
      if (!player || modeRef.current === "idle") {
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
              return;
            }
            if (event.data === window.YT?.PlayerState.PLAYING) {
              // Re-assert pause (autoplay races loadVideoById/loadPlaylist).
              if (pausedRef.current) {
                appliedPaused.current = true;
                try {
                  playerRef.current?.pauseVideo();
                } catch {
                  // ignore
                }
                return;
              }
              handleFallbackTrack();
            }
          },
          onError: (event: { data: number }) => {
            // eslint-disable-next-line no-console
            console.error("[overlay] YouTube player error", event.data);
            // In fallback, a bad video shouldn't stall the radio.
            if (modeRef.current === "fallback") {
              try {
                playerRef.current?.nextVideo();
              } catch {
                // ignore
              }
            }
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
        title={display?.title ?? null}
        thumbnailUrl={display?.thumbnailUrl ?? null}
        requestedBy={display?.requestedBy ?? null}
        progress={progress}
        idle={!display}
        paused={paused}
        animateHide
        fallback={display?.fallback ?? false}
        skipVotes={skipVotes}
        skipNeeded={skipNeeded}
      />
    </div>
  );
}
