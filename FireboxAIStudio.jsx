import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Server, Palette, Database, ShieldCheck, FlaskConical, Rocket,
  CheckCircle2, AlertTriangle, Loader2, Play, Sparkles,
  Terminal, Copy, Check, ChevronRight, RotateCcw, History, X, PanelLeft,
} from "lucide-react";

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const C = {
  bg: "#080B11",
  panel: "#0E1219",
  panelHi: "#141921",
  border: "#1E2535",
  borderHi: "#2A3448",
  text: "#E8EBF2",
  muted: "#7A8399",
  faint: "#3A4255",
  accent: "#6D7FFF",
  accentGlow: "rgba(109,127,255,0.15)",
  success: "#34D399",
  error: "#F2545B",
};

const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_BODY = "'Inter', ui-sans-serif, system-ui, sans-serif";

/* ─── Agent metadata ─────────────────────────────────────────────────────── */
const AGENT_META = [
  { name: "Architect",  Icon: Brain,        color: "#A78BFA", label: "Architecture plan" },
  { name: "Backend",    Icon: Server,       color: "#60A5FA", label: "Server & API code" },
  { name: "Frontend",   Icon: Palette,      color: "#F472B6", label: "React components" },
  { name: "Database",   Icon: Database,     color: "#34D399", label: "MongoDB schemas" },
  { name: "Security",   Icon: ShieldCheck,  color: "#FBBF24", label: "Auth & security" },
  { name: "QA",         Icon: FlaskConical, color: "#FB923C", label: "Test suites" },
  { name: "Deployment", Icon: Rocket,       color: "#38BDF8", label: "CI/CD configs" },
];

function agentMeta(name) {
  return AGENT_META.find((a) => a.name === name) || AGENT_META[0];
}

/* ─── StatusBadge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    idle:    { label: "Idle",    bg: C.faint,                      text: C.muted,   dot: C.faint },
    working: { label: "Working", bg: "rgba(109,127,255,0.15)",     text: C.accent,  dot: C.accent },
    done:    { label: "Done",    bg: "rgba(52,211,153,0.12)",      text: C.success, dot: C.success },
    error:   { label: "Error",   bg: "rgba(242,84,91,0.12)",       text: C.error,   dot: C.error },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontFamily: FONT_BODY,
      background: s.bg, color: s.text, fontWeight: 600, letterSpacing: "0.02em",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0,
        animation: status === "working" ? "pulse 1.2s ease-in-out infinite" : "none",
      }} />
      {s.label}
    </span>
  );
}

/* ─── CopyButton ─────────────────────────────────────────────────────────── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
        borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel,
        color: C.muted, fontSize: 12, fontFamily: FONT_BODY, cursor: "pointer",
      }}
    >
      {copied ? <Check size={13} color={C.success} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function FireboxAIStudio() {
  const [phase, setPhase] = useState("idle"); // idle | building | complete | error
  const [description, setDescription] = useState("");
  const [agentStates, setAgentStates] = useState(
    AGENT_META.map((a) => ({ name: a.name, status: "idle", output: "", streaming: "" }))
  );
  const [activeAgent, setActiveAgent] = useState(null);
  const [selectedTab, setSelectedTab] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [recentBuilds, setRecentBuilds] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [cardOpen, setCardOpen] = useState(true); // pipeline card open/closed

  const terminalRef = useRef(null);
  const esRef = useRef(null);
  const streamingRef = useRef({});

  /* auto-scroll terminal */
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [agentStates]);

  useEffect(() => {
    fetch("/api/builds").then((r) => r.json()).then(setRecentBuilds).catch(() => {});
  }, []);

  const updateAgent = useCallback((name, patch) => {
    setAgentStates((prev) => prev.map((a) => (a.name === name ? { ...a, ...patch } : a)));
  }, []);

  const startBuild = useCallback(async () => {
    if (!description.trim()) return;
    setPhase("building");
    setErrorMsg("");
    streamingRef.current = {};
    setAgentStates(AGENT_META.map((a) => ({ name: a.name, status: "idle", output: "", streaming: "" })));
    setSelectedTab(null);
    setActiveAgent(null);
    setCardOpen(true);

    let buildId;
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start build");
      buildId = data.buildId;
    } catch (err) {
      setPhase("error");
      setErrorMsg(err.message);
      return;
    }

    const es = new EventSource(`/api/build/${buildId}/events`);
    esRef.current = es;

    es.addEventListener("agent-start", (e) => {
      const { agent } = JSON.parse(e.data);
      setActiveAgent(agent);
      updateAgent(agent, { status: "working", streaming: "" });
      streamingRef.current[agent] = "";
    });

    es.addEventListener("agent-token", (e) => {
      const { agent, token } = JSON.parse(e.data);
      streamingRef.current[agent] = (streamingRef.current[agent] || "") + token;
      updateAgent(agent, { streaming: streamingRef.current[agent] });
      setSelectedTab(agent);
    });

    es.addEventListener("agent-complete", (e) => {
      const { agent, output } = JSON.parse(e.data);
      updateAgent(agent, { status: "done", output, streaming: "" });
      streamingRef.current[agent] = output;
    });

    es.addEventListener("agent-error", (e) => {
      const { agent, message } = JSON.parse(e.data);
      updateAgent(agent, { status: "error", streaming: "" });
      setErrorMsg(`${agent} agent failed: ${message}`);
    });

    es.addEventListener("build-complete", () => {
      setPhase("complete");
      setActiveAgent(null);
      es.close();
      fetch("/api/builds").then((r) => r.json()).then(setRecentBuilds).catch(() => {});
    });

    es.addEventListener("build-error", (e) => {
      const { message } = JSON.parse(e.data);
      setPhase("error");
      setErrorMsg(message);
      es.close();
    });

    es.onerror = () => {
      setPhase("error");
      setErrorMsg("Connection to build server lost.");
      es.close();
    };
  }, [description, updateAgent]);

  const reset = () => {
    esRef.current?.close();
    setPhase("idle");
    setDescription("");
    setAgentStates(AGENT_META.map((a) => ({ name: a.name, status: "idle", output: "", streaming: "" })));
    setActiveAgent(null);
    setSelectedTab(null);
    setErrorMsg("");
    streamingRef.current = {};
    setCardOpen(true);
  };

  const doneCount = agentStates.filter((a) => a.status === "done").length;
  const progress = (doneCount / AGENT_META.length) * 100;
  const selectedAgentState = agentStates.find((a) => a.name === selectedTab);
  const displayText = selectedAgentState ? (selectedAgentState.output || selectedAgentState.streaming) : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; overflow: hidden; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.faint}; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .agent-row:hover { background: ${C.panelHi} !important; }
        .tab-btn:hover   { background: ${C.panelHi} !important; }
        .icon-btn:hover  { background: ${C.panelHi} !important; color: ${C.text} !important; }
        .build-btn:hover { filter: brightness(1.1); }
        .build-btn:active{ transform: scale(0.98); }
        .history-row:hover { background: ${C.panelHi} !important; }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column", height: "100vh",
        background: C.bg, fontFamily: FONT_BODY, color: C.text, overflow: "hidden",
      }}>

        {/* ── Top bar ─────────────────────────────────────────────────────────── */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: `1px solid ${C.border}`,
          background: C.panel, flexShrink: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Pipeline card toggle */}
            <button
              onClick={() => setCardOpen((o) => !o)}
              className="icon-btn"
              title={cardOpen ? "Hide pipeline" : "Show pipeline"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`,
                background: cardOpen ? C.accentGlow : "transparent",
                color: cardOpen ? C.accent : C.muted, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <PanelLeft size={15} />
            </button>
            <Sparkles size={16} color={C.accent} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: "0.05em" }}>
              FIREBOX AI STUDIO
            </span>
            <span style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 20,
              background: C.accentGlow, color: C.accent, fontWeight: 700, letterSpacing: "0.05em",
            }}>LIVE</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {phase !== "idle" && (
              <button onClick={reset} className="icon-btn" style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted, fontSize: 12,
                fontFamily: FONT_BODY, cursor: "pointer", transition: "all 0.15s",
              }}>
                <RotateCcw size={12} /> New Build
              </button>
            )}
            <button onClick={() => setShowHistory((s) => !s)} className="icon-btn" style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: showHistory ? C.panelHi : "transparent",
              color: C.muted, fontSize: 12, fontFamily: FONT_BODY, cursor: "pointer",
              transition: "all 0.15s",
            }}>
              <History size={12} /> History
            </button>
          </div>
        </header>

        {/* ── History drawer ───────────────────────────────────────────────────── */}
        {showHistory && (
          <div style={{
            background: C.panel, borderBottom: `1px solid ${C.border}`,
            padding: "14px 20px", animation: "fadeIn 0.2s ease", zIndex: 9,
          }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 600, letterSpacing: "0.05em" }}>
              RECENT BUILDS
            </div>
            {recentBuilds.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint }}>No builds yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {recentBuilds.map((b) => (
                  <div key={b._id} className="history-row" style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 12px", borderRadius: 8, background: C.panelHi,
                    border: `1px solid ${C.border}`, animation: "fadeIn 0.2s ease",
                  }}>
                    <div style={{ fontSize: 12, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.description}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 12, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: b.status === "complete" ? C.success : b.status === "failed" ? C.error : C.muted,
                      }}>{b.status}</span>
                      <span style={{ fontSize: 11, color: C.faint }}>
                        {new Date(b.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Body: code viewer + floating pipeline card ───────────────────────── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* ── Full-width code viewer ───────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Tab bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 2, padding: "8px 16px",
              borderBottom: `1px solid ${C.border}`, background: C.panel,
              overflowX: "auto", flexShrink: 0,
            }}>
              {AGENT_META.map((meta) => {
                const state = agentStates.find((a) => a.name === meta.name);
                const isAvailable = state.status === "done" || state.status === "working";
                const isSelected = selectedTab === meta.name;
                return (
                  <button
                    key={meta.name}
                    className="tab-btn"
                    onClick={() => isAvailable && setSelectedTab(meta.name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 7, flexShrink: 0,
                      border: `1px solid ${isSelected ? C.borderHi : "transparent"}`,
                      background: isSelected ? C.panelHi : "transparent",
                      color: isSelected ? C.text : isAvailable ? C.muted : C.faint,
                      fontSize: 12, fontFamily: FONT_BODY, fontWeight: 500,
                      cursor: isAvailable ? "pointer" : "not-allowed",
                      transition: "all 0.15s",
                    }}
                  >
                    <meta.Icon
                      size={12}
                      color={state.status === "done" ? meta.color : state.status === "working" ? C.accent : C.faint}
                    />
                    {meta.name}
                    {state.status === "working" && (
                      <Loader2 size={11} color={C.accent} style={{ animation: "spin 1s linear infinite" }} />
                    )}
                    {state.status === "done" && <CheckCircle2 size={11} color={C.success} />}
                  </button>
                );
              })}
            </div>

            {/* Code content */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {!selectedTab ? (
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 16, padding: 40,
                }}>
                  {phase === "idle" ? (
                    <>
                      <div style={{
                        width: 60, height: 60, borderRadius: 18,
                        background: C.accentGlow, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        border: `1px solid ${C.borderHi}`,
                      }}>
                        <Sparkles size={26} color={C.accent} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontFamily: FONT_DISPLAY, fontWeight: 600, marginBottom: 8 }}>
                          Your AI-generated code will appear here
                        </div>
                        <div style={{ fontSize: 13, color: C.muted, maxWidth: 380, lineHeight: 1.7 }}>
                          {cardOpen
                            ? "Describe your app in the panel on the left, click Build, and watch 7 agents generate every layer — live."
                            : "Click the panel icon in the top-left to open the build panel, then describe your app."}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                        {AGENT_META.map((meta) => (
                          <span key={meta.name} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 11px", borderRadius: 20, fontSize: 12,
                            background: C.panel, border: `1px solid ${C.border}`, color: C.muted,
                          }}>
                            <meta.Icon size={11} color={meta.color} /> {meta.name}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <Loader2 size={30} color={C.accent} style={{ animation: "spin 1s linear infinite" }} />
                      <div style={{ fontSize: 14, color: C.muted }}>Agents working — output will appear here</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  {/* Code header bar */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 20px", borderBottom: `1px solid ${C.border}`,
                    background: C.panel, flexShrink: 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {(() => {
                        const meta = agentMeta(selectedTab);
                        return (
                          <>
                            <meta.Icon size={14} color={meta.color} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{meta.name} Agent</span>
                            <span style={{ fontSize: 12, color: C.faint }}>— {meta.label}</span>
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {agentStates.find((a) => a.name === selectedTab)?.status === "working" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%", background: C.accent,
                            animation: "pulse 1s ease-in-out infinite",
                          }} />
                          <span style={{ fontSize: 11, color: C.accent, fontFamily: FONT_MONO }}>generating</span>
                        </div>
                      )}
                      {displayText && <CopyButton text={displayText} />}
                    </div>
                  </div>
                  {/* Scrollable code */}
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {displayText ? (
                      <pre style={{
                        padding: "24px", margin: 0, fontFamily: FONT_MONO, fontSize: 13,
                        lineHeight: 1.75, color: "#C9D1E0", whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}>
                        {displayText}
                        {agentStates.find((a) => a.name === selectedTab)?.status === "working" && (
                          <span style={{ animation: "pulse 0.8s ease-in-out infinite", color: C.accent }}>▊</span>
                        )}
                      </pre>
                    ) : (
                      <div style={{ padding: 24, color: C.faint, fontSize: 13, fontFamily: FONT_MONO }}>
                        Waiting for output…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Floating pipeline card ──────────────────────────────────────────── */}
          {cardOpen && (
            <div style={{
              position: "absolute", top: 12, left: 12,
              width: 340, maxHeight: "calc(100% - 24px)",
              background: C.panel, border: `1px solid ${C.borderHi}`,
              borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
              display: "flex", flexDirection: "column", overflow: "hidden",
              animation: "slideIn 0.2s ease", zIndex: 20,
            }}>

              {/* Card header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY, letterSpacing: "0.04em" }}>
                    AGENT PIPELINE
                  </span>
                  {phase !== "idle" && (
                    <span style={{ fontSize: 11, color: C.muted }}>
                      {doneCount}/{AGENT_META.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCardOpen(false)}
                  className="icon-btn"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`,
                    background: "transparent", color: C.muted, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Scrollable card body */}
              <div style={{ overflowY: "auto", flex: 1 }}>

                {/* Prompt area */}
                <div style={{ padding: "14px 14px 0" }}>
                  {phase === "idle" ? (
                    <>
                      <div style={{ fontSize: 17, fontFamily: FONT_DISPLAY, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>
                        Describe the app<br />you want built.
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
                        7 AI agents will plan, build, secure, test, and deploy it — live.
                      </div>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) startBuild(); }}
                        placeholder="e.g. A task management app with real-time collaboration, user auth, analytics dashboard…"
                        rows={4}
                        style={{
                          width: "100%", background: C.panelHi,
                          border: `1px solid ${C.border}`, borderRadius: 9,
                          padding: "10px 12px", color: C.text, fontSize: 12,
                          fontFamily: FONT_MONO, resize: "none", outline: "none", lineHeight: 1.6,
                          transition: "border-color 0.2s",
                        }}
                        onFocus={(e) => (e.target.style.borderColor = C.accent)}
                        onBlur={(e)  => (e.target.style.borderColor = C.border)}
                      />
                      <button
                        onClick={startBuild}
                        disabled={!description.trim()}
                        className="build-btn"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                          width: "100%", marginTop: 10, padding: "10px",
                          borderRadius: 9, border: "none",
                          background: description.trim()
                            ? "linear-gradient(135deg,#6D7FFF 0%,#A78BFA 100%)"
                            : C.faint,
                          color: "#fff", fontSize: 13, fontFamily: FONT_DISPLAY,
                          fontWeight: 600, cursor: description.trim() ? "pointer" : "not-allowed",
                          transition: "all 0.2s",
                        }}
                      >
                        <Play size={13} fill="white" /> Build with AI
                      </button>
                      <div style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 6, marginBottom: 4 }}>
                        Ctrl + Enter to start
                      </div>
                    </>
                  ) : (
                    <div style={{
                      padding: "10px 12px", borderRadius: 9,
                      background: C.panelHi, border: `1px solid ${C.border}`, marginBottom: 4,
                    }}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontWeight: 700, letterSpacing: "0.06em" }}>
                        BUILDING
                      </div>
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, fontFamily: FONT_MONO }}>
                        {description}
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {phase !== "idle" && (
                  <div style={{ padding: "10px 14px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                        {phase === "complete" ? "✓ Complete" : `Agent ${Math.min(doneCount + (activeAgent ? 1 : 0), 7)} of 7`}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>{Math.round(progress)}%</span>
                    </div>
                    <div style={{ height: 3, background: C.faint, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2, transition: "width 0.4s ease",
                        background: phase === "complete" ? C.success : "linear-gradient(90deg,#6D7FFF,#A78BFA)",
                        width: `${progress}%`,
                      }} />
                    </div>
                  </div>
                )}

                {/* Agent rows */}
                <div style={{ padding: "10px 10px" }}>
                  {AGENT_META.map((meta) => {
                    const state = agentStates.find((a) => a.name === meta.name);
                    const isActive = activeAgent === meta.name;
                    return (
                      <div
                        key={meta.name}
                        className="agent-row"
                        onClick={() => state.status !== "idle" && setSelectedTab(meta.name)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "8px 8px",
                          borderRadius: 9, marginBottom: 3,
                          cursor: state.status !== "idle" ? "pointer" : "default",
                          background: isActive ? C.accentGlow : "transparent",
                          border: `1px solid ${isActive ? C.borderHi : "transparent"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                          background: state.status === "idle" ? C.faint + "30" : `${meta.color}18`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: `1px solid ${state.status === "idle" ? "transparent" : meta.color + "35"}`,
                        }}>
                          {isActive
                            ? <Loader2 size={14} color={meta.color} style={{ animation: "spin 1s linear infinite" }} />
                            : <meta.Icon size={14} color={state.status === "idle" ? C.faint : meta.color} />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: state.status === "idle" ? C.muted : C.text }}>
                              {meta.name}
                            </span>
                            <StatusBadge status={state.status} />
                          </div>
                          <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {state.status === "done" ? "✓ " : ""}{meta.label}
                          </div>
                        </div>
                        {state.status !== "idle" && <ChevronRight size={13} color={C.faint} style={{ flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>

                {/* Live terminal (active agent streaming) */}
                {activeAgent && (
                  <div style={{
                    margin: "0 10px 10px", borderRadius: 9, overflow: "hidden",
                    border: `1px solid ${C.borderHi}`,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "7px 11px",
                      background: C.panelHi, borderBottom: `1px solid ${C.border}`,
                    }}>
                      <Terminal size={11} color={C.accent} />
                      <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, fontFamily: FONT_MONO }}>
                        {activeAgent} — generating…
                      </span>
                    </div>
                    <div
                      ref={terminalRef}
                      style={{
                        height: 100, overflowY: "auto", padding: "8px 11px",
                        background: "#060810", fontFamily: FONT_MONO, fontSize: 11,
                        color: "#9BA8C0", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}
                    >
                      {agentStates.find((a) => a.name === activeAgent)?.streaming || ""}
                      <span style={{ animation: "pulse 0.8s ease-in-out infinite", color: C.accent }}>▊</span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {errorMsg && (
                  <div style={{
                    margin: "0 10px 10px", padding: "9px 11px", borderRadius: 9,
                    background: "rgba(242,84,91,0.08)", border: "1px solid rgba(242,84,91,0.25)",
                    display: "flex", gap: 7, alignItems: "flex-start",
                  }}>
                    <AlertTriangle size={13} color={C.error} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>{errorMsg}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Complete banner ──────────────────────────────────────────────────── */}
        {phase === "complete" && (
          <div style={{
            padding: "10px 20px", background: "rgba(52,211,153,0.07)",
            borderTop: `1px solid rgba(52,211,153,0.18)`,
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={15} color={C.success} />
              <span style={{ fontSize: 13, color: C.success, fontWeight: 600 }}>
                All 7 agents completed — your app is fully specified.
              </span>
            </div>
            <button onClick={reset} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 14px", borderRadius: 8, border: `1px solid ${C.success}33`,
              background: "rgba(52,211,153,0.09)", color: C.success,
              fontSize: 12, fontFamily: FONT_BODY, cursor: "pointer",
            }}>
              <RotateCcw size={12} /> Build another
            </button>
          </div>
        )}
      </div>
    </>
  );
}
