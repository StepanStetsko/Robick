import type { CSSProperties } from "react";

// Minimalist "now playing" music-player card. Shared by the OBS overlay
// (/overlay/player) and its preview on the admin "Пісні" page, so both look
// identical. Pure presentational: the parent decides placement.

type NowPlayingCardProps = {
  title: string | null;
  thumbnailUrl: string | null;
  requestedBy: string | null;
  /** Playback progress 0..1 (drives the bottom bar). */
  progress?: number;
  /** Nothing is playing — show the idle state instead. */
  idle?: boolean;
  /** Playback is paused — freeze the equalizer and show a pause label. */
  paused?: boolean;
  /**
   * When true, pausing fades the whole card out (and resuming fades it back in)
   * instead of just showing a pause label. Used by the OBS overlay so the scene
   * is clean while paused; the admin preview leaves it false.
   */
  animateHide?: boolean;
  /** Idle but Spotify fallback is playing — show a Spotify label instead. */
  spotifyFallback?: boolean;
  /** Current skip-vote tally (shows a chip when > 0). */
  skipVotes?: number;
  skipNeeded?: number;
};

const ACCENT = "#22c55e";
const SPOTIFY_COLOR = "#1db954";
const PAUSE_COLOR = "#f59e0b";
const CARD_WIDTH = 420;

export function NowPlayingCard({
  title,
  thumbnailUrl,
  requestedBy,
  progress = 0,
  idle = false,
  paused = false,
  animateHide = false,
  spotifyFallback = false,
  skipVotes = 0,
  skipNeeded = 0,
}: NowPlayingCardProps) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  const showVotes = !idle && skipVotes > 0 && skipNeeded > 0;
  // Overlay-only: while paused the card gently fades/slides away, and slides
  // back in on resume. Everything else keeps rendering so the transition is
  // smooth (no unmount) — we only animate opacity + transform.
  const hidden = animateHide && paused;

  return (
    <div
      style={{
        width: CARD_WIDTH,
        maxWidth: "100%",
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        background: "rgba(16,18,24,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        backdropFilter: "blur(10px)",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#f5f7fa",
        opacity: hidden ? 0 : 1,
        transform: hidden
          ? "translateY(14px) scale(0.96)"
          : "translateY(0) scale(1)",
        transition: "opacity 0.55s ease, transform 0.55s ease",
        pointerEvents: hidden ? "none" : "auto",
        willChange: "opacity, transform",
      }}
    >
      <style>{keyframes}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: 14,
        }}
      >
        {/* Album art / thumbnail */}
        <div
          style={{
            width: 72,
            height: 72,
            flexShrink: 0,
            borderRadius: 12,
            overflow: "hidden",
            background: "#1a1d26",
            display: "grid",
            placeItems: "center",
          }}
        >
          {thumbnailUrl && !idle ? (
            <img
              src={thumbnailUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 30, color: "#4b5262" }}>♪</span>
          )}
        </div>

        {/* Text column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            {idle ? (
              spotifyFallback ? (
                <>
                  <Equalizer color={SPOTIFY_COLOR} />
                  <span style={labelStyle(SPOTIFY_COLOR)}>♫ Spotify</span>
                </>
              ) : (
                <span style={labelStyle("#6b7280")}>Черга порожня</span>
              )
            ) : paused ? (
              <span style={labelStyle(PAUSE_COLOR)}>⏸ Пауза</span>
            ) : (
              <>
                <Equalizer />
                <span style={labelStyle(ACCENT)}>Зараз грає</span>
              </>
            )}

            {showVotes ? (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#f5f7fa",
                  background: "rgba(255,255,255,0.10)",
                  borderRadius: 999,
                  padding: "2px 9px",
                  whiteSpace: "nowrap",
                }}
              >
                ⏭ {skipVotes}/{skipNeeded}
              </span>
            ) : null}
          </div>

          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.25,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {idle
              ? spotifyFallback
                ? "Spotify — фонова музика"
                : "Замов пісню — !пісня <youtube>"
              : title || "Без назви"}
          </div>

          {!idle && requestedBy ? (
            <div
              style={{
                fontSize: 13,
                color: "#9aa4b2",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              ♪ від {requestedBy}
            </div>
          ) : null}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "rgba(255,255,255,0.08)" }}>
        <div
          style={{
            height: "100%",
            width: `${idle ? 0 : pct}%`,
            background: paused ? PAUSE_COLOR : ACCENT,
            transition: "width 0.4s linear",
          }}
        />
      </div>
    </div>
  );
}

function labelStyle(color: string): CSSProperties {
  return {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color,
  };
}

function Equalizer({ color = ACCENT }: { color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        gap: 2,
        height: 12,
      }}
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: "100%",
            background: color,
            borderRadius: 1,
            transformOrigin: "bottom",
            animation: `nowplaying-eq 0.9s ${i * 0.15}s ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  );
}

const keyframes = `
@keyframes nowplaying-eq {
  0%, 100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
}
`;
