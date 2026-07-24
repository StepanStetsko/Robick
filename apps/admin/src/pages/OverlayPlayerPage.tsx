import { useEffect, useRef, useState } from "react";
import { NowPlayingCard } from "../components/NowPlayingCard";

// Public OBS overlay. Plays the song-request queue in order and, when the queue
// is empty, a YouTube "mix" (radio) seeded in settings. Uses TWO hidden YouTube
// players so the radio keeps its position: a request pauses the radio player
// (never destroys it) and plays in the queue player; when the queue empties the
// radio resumes exactly where it left off instead of reloading the mix from the
// first track. Only one player is audible at a time. Add as a Browser Source in
// OBS pointing at /overlay/player.

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

const STATE_POLL_MS = 700;
const PROGRESS_POLL_MS = 500;

type Role = "radio" | "queue";
type Mode = "queue" | "fallback" | "idle";

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
  const radioRef = useRef<YTPlayer | null>(null);
  const queueRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef<{ radio: boolean; queue: boolean }>({
    radio: false,
    queue: false,
  });
  // The mix currently loaded into the radio player (loaded once; kept alive and
  // just paused/resumed so returning to the radio continues where it left off).
  const loadedMixListId = useRef<string | null>(null);
  // The request video currently loaded into the queue player.
  const loadedQueueVideoId = useRef<string | null>(null);
  const pausedRef = useRef(true);
  const modeRef = useRef<Mode>("idle");
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

    function bothReady(): boolean {
      return readyRef.current.radio && readyRef.current.queue;
    }

    function activePlayer(): YTPlayer | null {
      if (modeRef.current === "queue") {
        return queueRef.current;
      }
      if (modeRef.current === "fallback") {
        return radioRef.current;
      }
      return null;
    }

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

    /** Make exactly the mode's player audible; pause the other one. */
    function applyPlayback() {
      const mode = modeRef.current;
      const isPaused = pausedRef.current;
      const radio = radioRef.current;
      const queue = queueRef.current;
      try {
        if (mode === "fallback" && !isPaused) {
          radio?.playVideo();
        } else {
          radio?.pauseVideo();
        }
      } catch {
        // player not ready — retried on the next tick
      }
      try {
        if (mode === "queue" && !isPaused) {
          queue?.playVideo();
        } else {
          queue?.pauseVideo();
        }
      } catch {
        // player not ready — retried on the next tick
      }
    }

    function enterQueue(song: SongDto) {
      modeRef.current = "queue";
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
      if (song.videoId !== loadedQueueVideoId.current) {
        loadedQueueVideoId.current = song.videoId;
        setProgress(0);
        try {
          queueRef.current?.loadVideoById(song.videoId);
        } catch {
          // player not ready — reset so the next tick retries the load
          loadedQueueVideoId.current = null;
        }
      }
    }

    function enterFallback(mixListId: string) {
      modeRef.current = "fallback";
      // Next request reloads even if it's the same id we last played.
      loadedQueueVideoId.current = null;
      if (mixListId !== loadedMixListId.current) {
        loadedMixListId.current = mixListId;
        setProgress(0);
        try {
          radioRef.current?.loadPlaylist({
            list: mixListId,
            listType: "playlist",
          });
        } catch {
          // player not ready — reset so the next tick retries the load
          loadedMixListId.current = null;
        }
      }
      // Otherwise the mix is already loaded — applyPlayback() resumes it in place.
      if (!pausedRef.current) {
        handleFallbackTrack();
      }
    }

    function goIdle() {
      modeRef.current = "idle";
      setProgress(0);
      setDisplay(null);
      if (reportedVideoId.current) {
        reportedVideoId.current = null;
        reportFallback(null);
      }
    }

    /** In fallback mode: skip blocked tracks, else publish the current one. */
    function handleFallbackTrack() {
      const player = radioRef.current;
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
      if (!bothReady()) {
        return;
      }
      try {
        const state = await fetchState();
        if (!state || disposed) {
          return;
        }
        fallbackRef.current = state.fallback;
        setSkipVotes(state.skipVotes);
        setSkipNeeded(state.skipVotesNeeded);
        pausedRef.current = state.paused;
        setPaused(state.paused);

        if (state.current) {
          enterQueue(state.current);
        } else if (state.fallback.enabled && state.fallback.mixListId) {
          enterFallback(state.fallback.mixListId);
        } else {
          goIdle();
        }

        applyPlayback();
      } catch {
        // ignore — retried on the next tick
      }
    }

    async function onEnded(role: Role) {
      if (role === "radio") {
        if (modeRef.current !== "fallback") {
          return;
        }
        try {
          radioRef.current?.nextVideo();
        } catch {
          // ignore
        }
        return;
      }
      // queue player finished the requested song
      if (modeRef.current !== "queue") {
        return;
      }
      try {
        const next = await advance();
        if (disposed) {
          return;
        }
        if (next) {
          enterQueue(next);
          applyPlayback();
        } else {
          // Queue drained — re-sync to fall back to the radio.
          void syncState();
        }
      } catch {
        // Network blip — the state poll will recover.
      }
    }

    function onPlaying(role: Role) {
      const isPaused = pausedRef.current;
      if (role === "radio") {
        // Re-assert pause / silence the radio when it isn't the active source
        // (autoplay races loadPlaylist and mode switches).
        if (isPaused || modeRef.current !== "fallback") {
          try {
            radioRef.current?.pauseVideo();
          } catch {
            // ignore
          }
          return;
        }
        handleFallbackTrack();
        return;
      }
      // queue player
      if (isPaused || modeRef.current !== "queue") {
        try {
          queueRef.current?.pauseVideo();
        } catch {
          // ignore
        }
      }
    }

    function pollProgress() {
      const player = activePlayer();
      if (!player) {
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

    function createPlayer(elementId: string, role: Role): YTPlayer | null {
      if (!window.YT) {
        return null;
      }
      return new window.YT.Player(elementId, {
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
          onReady: () => {
            readyRef.current[role] = true;
            if (bothReady()) {
              void syncState();
            }
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === window.YT?.PlayerState.ENDED) {
              void onEnded(role);
              return;
            }
            if (event.data === window.YT?.PlayerState.PLAYING) {
              onPlaying(role);
            }
          },
          onError: (event: { data: number }) => {
            // eslint-disable-next-line no-console
            console.error(`[overlay:${role}] YouTube player error`, event.data);
            // In fallback, a bad video shouldn't stall the radio.
            if (role === "radio" && modeRef.current === "fallback") {
              try {
                radioRef.current?.nextVideo();
              } catch {
                // ignore
              }
            }
          },
        },
      });
    }

    function createPlayers() {
      radioRef.current = createPlayer("yt-radio", "radio");
      queueRef.current = createPlayer("yt-queue", "queue");
    }

    if (window.YT && window.YT.Player) {
      createPlayers();
    } else {
      window.onYouTubeIframeAPIReady = createPlayers;
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
      radioRef.current?.destroy();
      queueRef.current?.destroy();
      radioRef.current = null;
      queueRef.current = null;
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
      {/* Hidden YouTube players — kept in the DOM so the audio keeps playing. */}
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
        <div id="yt-radio" />
        <div id="yt-queue" />
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
