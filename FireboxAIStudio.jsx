import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Server, Palette, Database, ShieldCheck, FlaskConical, Rocket,
  CheckCircle2, AlertTriangle, Loader2, Play, Sparkles, Clock,
  Terminal, Copy, Check, ChevronRight, RotateCcw, History,
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
  warning: "#FBBF24",
};

const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_BODY = "'Inter', ui-sans-serif, system-ui, sans-serif";

/* ─── Agent metadata (mirrors server/agents/config.js) ───────────────────── */
const AGENT_META = [
  { name: "Architect",   Icon: Brain,        color: "#A78BFA", label: "Architecture plan" },
  { name: "Backend",     Icon: Server,       color: "#60A5FA", label: "Server & API code" },
  { name: "Frontend",    Icon: Palette,      color: "#F472B6", label: "React components" },
  { name: "Database",    Icon: Database,     color: "#34D399", label: "MongoDB schemas" },
  { name: "Security",    Icon: ShieldCheck,  color: "#FBBF24", label: "Auth & security" },
  { name: "QA",          Icon: FlaskConical, color: "#FB923C", label: "Test suites" },
  { name: "Deployment",  Icon: Rocket,       color: "#38BDF8", label: "CI/CD configs" },
];

/* ─── Utilities ──────────────────────────────────────────────────────────── */
function agentMeta(name) {
  return AGENT_META.find((a) => a.name === name) || AGENT_META[0];
}

function StatusBadge({ status }) {
  const map = {
    idle:    { label: "Idle",    bg: C.faint,   text: C.muted,   dot: C.faint },
    working: { label: "Working", bg: "rgba(109,127,255,0.15)", text: C.accent, dot: C.accent },
    done:    { label: "Done",    bg: "rgba(52,211,153,0.12)",  text: C.success, dot: C.success },
    error:   { label: "Error",   bg: "rgba(242,84,91,0.12)",   text: C.error,   dot: C.error },
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

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
      borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel,
      color: C.muted, fontSize: 12, fontFamily: FONT_BODY, cursor: "pointer",
      transition: "all 0.15s",
    }}>
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

  const terminalRef = useRef(null);
  const esRef = useRef(null);
  const streamingRef = useRef({}); // agent name → accumulated streaming text

  /* auto-scroll terminal */
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [agentStates]);

  /* fetch recent builds on mount */
  useEffect(() => {
    fetch("/api/builds")
      .then((r) => r.json())
      .then(setRecentBuilds)
      .catch(() => {});
  }, []);

  const updateAgent = useCallback((name, patch) => {
    setAgentStates((prev) =>
      prev.map((a) => (a.name === name ? { ...a, ...patch } : a))
    );
  }, []);

  const startBuild = useCallback(async () => {
    if (!description.trim()) return;
    setPhase("building");
    setErrorMsg("");
    streamingRef.current = {};
    setAgentStates(AGENT_META.map((a) => ({ name: a.name, status: "idle", output: "", streaming: "" })));
    setSelectedTab(null);
    setActiveAgent(null);

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
      fetch("/api/builds")
        .then((r) => r.json())
        .then(setRecentBuilds)
        .catch(() => {});
    });

    es.addEventListener("build-error", (e) => {
      const { message } = JSON.parse(e.data);
      setPhase("error");
      setErrorMsg(message);
      es.close();
    });

    es.onerror = () => {
      if (phase !== "complete") {
        setPhase("error");
        setErrorMsg("Connection to build server lost.");
      }
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
  };

  const doneCount = agentStates.filter((a) => a.status === "done").length;
  const progress = (doneCount / AGENT_META.length) * 100;

  /* ─── Render helpers ────────────────────────────────────────────────────── */
  const selectedAgentState = agentStates.find((a) => a.name === selectedTab);
  const displayText = selectedAgentState
    ? selectedAgentState.output || selectedAgentState.streaming
    : "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.faint}; border-radius: 3px; }
        @keyframes pulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .agent-row:hover { background: ${C.panelHi} !important; }
        .tab-btn:hover { background: ${C.panelHi} !important; }
        .build-btn:hover { filter: brightness(1.1); }
        .build-btn:active { transform: scale(0.98); }
        .history-row:hover { background: ${C.panelHi} !important; }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column", minHeight: "100vh",
        background: C.bg, fontFamily: FONT_BODY, color: C.text,
      }}>
        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 24px", borderBottom: `1px solid ${C.border}`,
          background: C.panel, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={18} color={C.accent} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, letterSpacing: "0.05em", color: C.text }}>
              FIREBOX AI STUDIO
            </span>
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 20,
              background: C.accentGlow, color: C.accent, fontWeight: 600,
            }}>LIVE</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {phase !== "idle" && (
              <button onClick={reset} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted, fontSize: 13,
                fontFamily: FONT_BODY, cursor: "pointer",
              }}>
                <RotateCcw size={13} /> New Build
              </button>
            )}
            <button onClick={() => setShowHistory((s) => !s)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: showHistory ? C.panelHi : "transparent",
              color: C.muted, fontSize: 13, fontFamily: FONT_BODY, cursor: "pointer",
            }}>
              <History size={13} /> History
            </button>
          </div>
        </header>

        {/* ── History drawer ─────────────────────────────────────────────────── */}
        {showHistory && (
          <div style={{
            background: C.panel, borderBottom: `1px solid ${C.border}`,
            padding: "16px 24px", animation: "fadeIn 0.2s ease",
          }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, fontWeight: 600 }}>
              Recent Builds
            </div>
            {recentBuilds.length === 0 ? (
              <div style={{ fontSize: 13, color: C.faint }}>No builds yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentBuilds.map((b) => (
                  <div key={b._id} className="history-row" style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 8, background: C.panelHi,
                    border: `1px solid ${C.border}`, cursor: "default",
                    animation: "fadeIn 0.2s ease",
                  }}>
                    <div style={{ fontSize: 13, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.description}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 12, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 11, color: b.status === "complete" ? C.success : b.status === "failed" ? C.error : C.muted,
                        fontWeight: 600,
                      }}>
                        {b.status}
                      </span>
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

        {/* ── Main two-column layout ─────────────────────────────────────────── */}
        <div style={{
          display: "flex", flex: 1, overflow: "hidden", minHeight: 0,
        }}>
          {/* ── LEFT COLUMN: Agent pipeline ──────────────────────────────────── */}
          <div style={{
            width: 380, flexShrink: 0, display: "flex", flexDirection: "column",
            borderRight: `1px solid ${C.border}`, background: C.panel, overflow: "hidden",
          }}>
            {/* Prompt input (shown always, but locked while building) */}
            <div style={{ padding: "20px 20px 0" }}>
              {phase === "idle" ? (
                <>
                  <div style={{ fontSize: 22, fontFamily: FONT_DISPLAY, fontWeight: 700, marginBottom: 6, color: C.text, lineHeight: 1.3 }}>
                    Describe the app<br />you want built.
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
                    7 specialist AI agents will plan, build, secure, test, and deploy it — live.
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) startBuild(); }}
                    placeholder="e.g. A task management app with real-time collaboration, user auth, analytics dashboard, and mobile-friendly design…"
                    rows={5}
                    style={{
                      width: "100%", background: C.panelHi, border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 13,
                      fontFamily: FONT_MONO, resize: "vertical", outline: "none",
                      lineHeight: 1.6, transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = C.accent}
                    onBlur={(e) => e.target.style.borderColor = C.border}
                  />
                  <button
                    onClick={startBuild}
                    disabled={!description.trim()}
                    className="build-btn"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", marginTop: 12, padding: "12px",
                      borderRadius: 10, border: "none",
                      background: description.trim()
                        ? `linear-gradient(135deg, #6D7FFF 0%, #A78BFA 100%)`
                        : C.faint,
                      color: "#fff", fontSize: 14, fontFamily: FONT_DISPLAY,
                      fontWeight: 600, cursor: description.trim() ? "pointer" : "not-allowed",
                      transition: "all 0.2s",
                    }}
                  >
                    <Play size={14} fill="white" /> Build with AI
                  </button>
                  <div style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 8 }}>
                    Ctrl+Enter to start
                  </div>
                </>
              ) : (
                <div style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: C.panelHi, border: `1px solid ${C.border}`,
                  marginBottom: 4,
                }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600, letterSpacing: "0.05em" }}>
                    BUILDING
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, fontFamily: FONT_MONO }}>
                    {description}
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {phase !== "idle" && (
              <div style={{ padding: "14px 20px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                    {phase === "complete" ? "✓ Build complete" : `Agent ${doneCount + (activeAgent ? 1 : 0)} of ${AGENT_META.length}`}
                  </span>
                  <span style={{ fontSize: 11, color: C.muted }}>{Math.round(progress)}%</span>
                </div>
                <div style={{ height: 4, background: C.faint, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    background: phase === "complete" ? C.success : `linear-gradient(90deg, ${C.accent}, #A78BFA)`,
                    width: `${progress}%`, transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            )}

            {/* Agent list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
              {AGENT_META.map((meta) => {
                const state = agentStates.find((a) => a.name === meta.name);
                const isActive = activeAgent === meta.name;
                return (
                  <div
                    key={meta.name}
                    className="agent-row"
                    onClick={() => { if (state.status !== "idle") setSelectedTab(meta.name); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 10px",
                      borderRadius: 10, marginBottom: 4, cursor: state.status !== "idle" ? "pointer" : "default",
                      background: isActive ? C.accentGlow : "transparent",
                      border: `1px solid ${isActive ? C.borderHi : "transparent"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: state.status === "idle" ? C.faint : `${meta.color}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${state.status === "idle" ? "transparent" : `${meta.color}40`}`,
                    }}>
                      {isActive
                        ? <Loader2 size={16} color={meta.color} style={{ animation: "spin 1s linear infinite" }} />
                        : <meta.Icon size={16} color={state.status === "idle" ? C.faint : meta.color} />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: state.status === "idle" ? C.muted : C.text }}>
                          {meta.name}
                        </span>
                        <StatusBadge status={state.status} />
                      </div>
                      <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isActive ? meta.label : state.status === "done" ? "✓ " + meta.label : meta.label}
                      </div>
                    </div>
                    {state.status !== "idle" && (
                      <ChevronRight size={14} color={C.faint} style={{ flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live terminal */}
            {activeAgent && (
              <div style={{
                margin: "0 12px 12px", borderRadius: 10, overflow: "hidden",
                border: `1px solid ${C.borderHi}`, flexShrink: 0,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                  background: C.panelHi, borderBottom: `1px solid ${C.border}`,
                }}>
                  <Terminal size={12} color={C.accent} />
                  <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, fontFamily: FONT_MONO }}>
                    {activeAgent} — generating…
                  </span>
                </div>
                <div
                  ref={terminalRef}
                  style={{
                    height: 120, overflowY: "auto", padding: "10px 12px",
                    background: "#060810", fontFamily: FONT_MONO, fontSize: 11,
                    color: "#9BA8C0", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}
                >
                  {agentStates.find((a) => a.name === activeAgent)?.streaming || ""}
                  <span style={{ animation: "pulse 0.8s ease-in-out infinite", color: C.accent }}>▊</span>
                </div>
              </div>
            )}

            {/* Error message */}
            {errorMsg && (
              <div style={{
                margin: "0 12px 12px", padding: "10px 12px", borderRadius: 10,
                background: "rgba(242,84,91,0.08)", border: `1px solid rgba(242,84,91,0.3)`,
                display: "flex", gap: 8, alignItems: "flex-start",
              }}>
                <AlertTriangle size={14} color={C.error} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: What AI built ─────────────────────────────────── */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
            background: C.bg, minWidth: 0,
          }}>
            {/* Tab bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 2, padding: "10px 16px",
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
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "6px 14px", borderRadius: 8, flexShrink: 0,
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
                    {state.status === "done" && (
                      <CheckCircle2 size={11} color={C.success} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Code viewer */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {!selectedTab ? (
                /* Empty state */
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 16, padding: 40,
                }}>
                  {phase === "idle" ? (
                    <>
                      <div style={{
                        width: 64, height: 64, borderRadius: 20,
                        background: C.accentGlow, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        border: `1px solid ${C.borderHi}`,
                      }}>
                        <Sparkles size={28} color={C.accent} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontFamily: FONT_DISPLAY, fontWeight: 600, marginBottom: 8 }}>
                          Your AI-generated code will appear here
                        </div>
                        <div style={{ fontSize: 13, color: C.muted, maxWidth: 360, lineHeight: 1.6 }}>
                          Describe your app on the left, click Build, and watch 7 specialist agents generate every layer of your application — live.
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                        {AGENT_META.map((meta) => (
                          <span key={meta.name} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "5px 12px", borderRadius: 20, fontSize: 12,
                            background: C.panel, border: `1px solid ${C.border}`, color: C.muted,
                          }}>
                            <meta.Icon size={12} color={meta.color} /> {meta.name}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      <Loader2 size={32} color={C.accent} style={{ animation: "spin 1s linear infinite" }} />
                      <div style={{ fontSize: 14, color: C.muted }}>
                        Agents are working… output will appear here
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Code display */
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  {/* Code header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 20px", borderBottom: `1px solid ${C.border}`,
                    background: C.panel, flexShrink: 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {(() => {
                        const meta = agentMeta(selectedTab);
                        return (
                          <>
                            <meta.Icon size={15} color={meta.color} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{meta.name} Agent</span>
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

                  {/* Code content */}
                  <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
                    {displayText ? (
                      <pre style={{
                        padding: "24px", margin: 0, fontFamily: FONT_MONO, fontSize: 13,
                        lineHeight: 1.7, color: "#C9D1E0", whiteSpace: "pre-wrap",
                        wordBreak: "break-word", minHeight: "100%",
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
        </div>

        {/* ── Phase: complete banner ─────────────────────────────────────────── */}
        {phase === "complete" && (
          <div style={{
            padding: "12px 24px", background: "rgba(52,211,153,0.08)",
            borderTop: `1px solid rgba(52,211,153,0.2)`, display: "flex",
            alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle2 size={16} color={C.success} />
              <span style={{ fontSize: 13, color: C.success, fontWeight: 600 }}>
                All 7 agents completed — your app is fully specified.
              </span>
            </div>
            <button onClick={reset} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 16px", borderRadius: 8, border: `1px solid ${C.success}33`,
              background: "rgba(52,211,153,0.1)", color: C.success,
              fontSize: 12, fontFamily: FONT_BODY, cursor: "pointer",
            }}>
              <RotateCcw size={12} /> Build another
            </button>
          </div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </>
  );
}
