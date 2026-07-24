import { useEffect, useRef, useState } from "react";

// Public OBS overlay for the chat poll. Polls /public/poll and renders a voting
// widget with an appear/disappear animation. While running it shows live bars;
// when it ends the winner turns gold and the other options dim (they stay). Add
// as a Browser Source in OBS pointing at /overlay/poll.

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

const POLL_MS = 600;
const EXIT_MS = 550;

type PollOption = { label: string; votes: number };

type PollState = {
  active: boolean;
  status: "idle" | "running" | "ended";
  title: string;
  options: PollOption[];
  totalVotes: number;
  endsAt: number | null;
  durationSec: number;
  winnerIndex: number | null;
};

const GOLD = "#f5c518";

async function fetchPoll(): Promise<PollState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/poll`);
    const json = (await res.json()) as { ok: boolean; data: PollState | null };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function PollOverlayPage() {
  const [poll, setPoll] = useState<PollState | null>(null);
  const [visible, setVisible] = useState(false);
  const [now, setNow] = useState(Date.now());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transparent background for OBS (the admin app paints a body gradient).
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
    let disposed = false;

    async function tick() {
      const data = await fetchPoll();
      if (disposed || !data) {
        return;
      }
      if (data.active) {
        if (clearTimer.current) {
          clearTimeout(clearTimer.current);
          clearTimer.current = null;
        }
        setPoll(data);
        setVisible(true);
      } else if (visible) {
        // Play the disappear animation, then unmount.
        setVisible(false);
        clearTimer.current = setTimeout(() => setPoll(null), EXIT_MS);
      }
    }

    const pollTimer = setInterval(() => void tick(), POLL_MS);
    const clockTimer = setInterval(() => setNow(Date.now()), 250);
    void tick();

    return () => {
      disposed = true;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
      if (clearTimer.current) {
        clearTimeout(clearTimer.current);
      }
    };
  }, [visible]);

  if (!poll) {
    return <div style={{ position: "fixed", inset: 0 }} />;
  }

  const ended = poll.status === "ended";
  const maxVotes = Math.max(1, ...poll.options.map((o) => o.votes));
  const secondsLeft =
    poll.status === "running" && poll.endsAt
      ? Math.max(0, Math.ceil((poll.endsAt - now) / 1000))
      : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        padding: 24,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "100%",
          borderRadius: 18,
          padding: 18,
          background: "rgba(16,18,24,0.94)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
          backdropFilter: "blur(10px)",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#f5f7fa",
          opacity: visible ? 1 : 0,
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(-16px) scale(0.94)",
          transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease`,
          willChange: "opacity, transform",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
            {poll.title || "Голосування"}
          </div>
          <div
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 999,
              background: ended ? "rgba(245,197,24,0.16)" : "rgba(124,92,255,0.18)",
              color: ended ? GOLD : "#c9bcff",
              whiteSpace: "nowrap",
            }}
          >
            {ended ? "Завершено" : `⏳ ${secondsLeft}s`}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {poll.options.map((option, index) => {
            const isWinner = ended && poll.winnerIndex === index;
            const dimmed = ended && !isWinner;
            const pct =
              poll.totalVotes > 0
                ? Math.round((option.votes / poll.totalVotes) * 100)
                : 0;
            const barPct = (option.votes / maxVotes) * 100;

            return (
              <div
                key={index}
                style={{
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.05)",
                  border: isWinner
                    ? `1px solid ${GOLD}`
                    : "1px solid rgba(255,255,255,0.06)",
                  opacity: dimmed ? 0.4 : 1,
                  transition: "opacity 0.5s ease, border-color 0.5s ease",
                }}
              >
                {/* fill bar */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${barPct}%`,
                    background: isWinner
                      ? "linear-gradient(90deg, rgba(245,197,24,0.38), rgba(245,197,24,0.16))"
                      : "linear-gradient(90deg, rgba(124,92,255,0.34), rgba(124,92,255,0.12))",
                    transition: "width 0.5s ease, background 0.5s ease",
                  }}
                />
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 13px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: isWinner ? 800 : 600,
                      color: isWinner ? GOLD : "#f5f7fa",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <span style={{ opacity: 0.6, marginRight: 8 }}>{index + 1}</span>
                    {option.label}
                    {isWinner ? " 🏆" : ""}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: isWinner ? GOLD : "#c7cede",
                    }}
                  >
                    {option.votes} · {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#8b93a4",
            textAlign: "center",
          }}
        >
          {ended
            ? `Усього голосів: ${poll.totalVotes}`
            : "Пиши цифру або варіант у чат"}
        </div>
      </div>
    </div>
  );
}
