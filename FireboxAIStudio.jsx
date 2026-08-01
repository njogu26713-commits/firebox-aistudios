import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Server, Palette, Database, ShieldCheck, FlaskConical, Rocket,
  CheckCircle2, AlertTriangle, Loader2, ArrowRight, Sparkles, Play,
  Clock, MessageCircle, Terminal, RotateCcw,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Design tokens                                                          */
/* ---------------------------------------------------------------------- */
const C = {
  bg: "#0A0D13",
  panel: "#12161F",
  panelHi: "#161B26",
  border: "#232A38",
  borderHi: "#323B4E",
  text: "#EDEFF3",
  muted: "#8991A3",
  faint: "#4E5566",
  success: "#34D399",
  error: "#F2545B",
};

const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_BODY = "'Inter', ui-sans-serif, system-ui, sans-serif";

/* ---------------------------------------------------------------------- */
/*  Agent pipeline configuration                                           */
/* ---------------------------------------------------------------------- */
const AGENTS = [
  {
    id: "architect", name: "Architect", icon: Brain, color: "#8B7FF6",
    tasks: [
      { label: "Analyzing your prompt", ms: 1400 },
      { label: "Designing system architecture", ms: 1800 },
      { label: "Choosing the best tech stack", ms: 1300 },
    ],
    doneMsg: "Architecture approved — 3-tier stack selected",
    handoff: "Sending approved architecture & stack spec",
  },
  {
    id: "backend", name: "Backend Agent", icon: Server, color: "#F0A93A",
    tasks: [
      { label: "Generating Express API", ms: 1600 },
      { label: "Creating authentication", ms: 1500 },
      { label: "Building REST endpoints", ms: 1700 },
    ],
    doneMsg: "Backend completed — 14 endpoints live",
    handoff: "Sharing API contract (14 endpoints)",
    chat: { after: 0, text: "Will need `users` and `sessions` collections", to: "Database Agent" },
  },
  {
    id: "frontend", name: "Frontend Agent", icon: Palette, color: "#45C4E0",
    tasks: [
      { label: "Creating responsive UI", ms: 1500 },
      { label: "Building dashboard", ms: 1600 },
      { label: "Connecting frontend to backend", ms: 1400 },
    ],
    doneMsg: "Frontend completed — build size 184kb",
    handoff: "UI data requirements ready for review",
    chat: { after: 0, text: "Confirming /api/auth/login response shape", to: "Backend Agent" },
  },
  {
    id: "database", name: "Database Agent", icon: Database, color: "#34D399",
    tasks: [
      { label: "Designing MongoDB collections", ms: 1300 },
      { label: "Generating indexes", ms: 1100 },
      { label: "Creating migrations", ms: 1200 },
    ],
    doneMsg: "Database ready — 6 collections, 9 indexes",
    handoff: "Schema ready for security review",
  },
  {
    id: "security", name: "Security Agent", icon: ShieldCheck, color: "#F2545B",
    tasks: [
      { label: "Scanning for vulnerabilities", ms: 1400 },
      { label: "Checking authentication", ms: 1500 },
      { label: "Validating input sanitization", ms: 1300 },
    ],
    doneMsg: "Security score: A+",
    handoff: "Security clearance granted",
    chat: { after: 2, text: "Flagging auth endpoints for extra test coverage", to: "QA Agent" },
  },
  {
    id: "qa", name: "QA Agent", icon: FlaskConical, color: "#5B8DEF",
    tasks: [
      { label: "Running unit tests", ms: 1500 },
      { label: "Testing API endpoints", ms: 1600 },
      { label: "Checking UI responsiveness", ms: 1200 },
    ],
    doneMsg: "58 / 58 tests passed",
    handoff: "All tests green — cleared for deploy",
  },
  {
    id: "deployment", name: "Deployment Agent", icon: Rocket, color: "#FF8A3D",
    tasks: [
      { label: "Preparing production build", ms: 1400 },
      { label: "Optimizing assets", ms: 1300 },
      { label: "Creating deployment package", ms: 1200 },
    ],
    doneMsg: "Ready for deployment",
    handoff: null,
  },
];

const TOTAL_UNITS = AGENTS.reduce((a, ag) => a + ag.tasks.length, 0);
const HANDOFF_PAUSE = 650;
const RETRY_PAUSE = 1000;

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const fmtClock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

/* ---------------------------------------------------------------------- */

export default function FireboxAIStudio() {
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [prompt, setPrompt] = useState(
    "A task management app with team collaboration, real-time updates, and an analytics dashboard."
  );
  const [agents, setAgents] = useState(() => initAgents());
  const [logs, setLogs] = useState([]);
  const [tick, setTick] = useState(0);
  const [pulseEdge, setPulseEdge] = useState(null);
  const [overallStart, setOverallStart] = useState(null);
  const [overallEnd, setOverallEnd] = useState(null);

  const buildIdRef = useRef(0);
  const logEndRef = useRef(null);
  const securityRetried = useRef(false);
  const logIdRef = useRef(0);

  function initAgents() {
    return AGENTS.map((a) => ({
      id: a.id,
      status: "queued", // queued | active | error | done
      taskIndex: 0,
      taskLabel: "",
      taskStart: null,
      taskMs: 0,
    }));
  }

  /* ---- 100ms ticker for smooth progress / elapsed time while running --- */
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  const pushLog = useCallback((entry) => {
    logIdRef.current += 1;
    setLogs((prev) => [
      ...prev.slice(-60),
      { id: logIdRef.current, time: Date.now(), ...entry },
    ]);
  }, []);

  const patchAgent = useCallback((id, patch) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  /* ---------------------------- build runner ---------------------------- */
  const runBuild = useCallback(async () => {
    const myId = ++buildIdRef.current;
    const alive = () => buildIdRef.current === myId;

    setAgents(initAgents());
    setLogs([]);
    securityRetried.current = false;
    const start = Date.now();
    setOverallStart(start);
    setOverallEnd(null);
    setPhase("running");

    pushLog({ type: "system", text: "Initializing Firebox AI Studio…" });
    await wait(500);
    if (!alive()) return;

    for (let i = 0; i < AGENTS.length; i++) {
      const cfg = AGENTS[i];
      patchAgent(cfg.id, { status: "active", taskIndex: 0 });
      pushLog({ type: "system", agentId: cfg.id, text: `${cfg.name} activated` });

      for (let t = 0; t < cfg.tasks.length; t++) {
        const task = cfg.tasks[t];
        patchAgent(cfg.id, {
          taskIndex: t, taskLabel: task.label, taskStart: Date.now(), taskMs: task.ms,
        });
        pushLog({ type: "task", agentId: cfg.id, text: `${task.label}…` });
        await wait(task.ms);
        if (!alive()) return;

        // Simulated failure + retry, once, on the Security agent's 2nd task
        if (cfg.id === "security" && t === 1 && !securityRetried.current) {
          securityRetried.current = true;
          patchAgent(cfg.id, { status: "error" });
          pushLog({
            type: "error", agentId: cfg.id,
            text: "Vulnerability detected — missing rate-limit on /auth/login",
          });
          await wait(RETRY_PAUSE);
          if (!alive()) return;
          pushLog({ type: "retry", agentId: cfg.id, text: "Retrying task with hardened ruleset…" });
          patchAgent(cfg.id, { status: "active", taskStart: Date.now(), taskMs: 1100 });
          await wait(1100);
          if (!alive()) return;
          pushLog({ type: "task", agentId: cfg.id, text: "Checking authentication — patched" });
        }

        // mid-build chatter between agents
        if (cfg.chat && cfg.chat.after === t) {
          pushLog({ type: "chat", agentId: cfg.id, to: cfg.chat.to, text: cfg.chat.text });
        }
      }

      patchAgent(cfg.id, { status: "done", taskIndex: cfg.tasks.length });
      pushLog({ type: "success", agentId: cfg.id, text: cfg.doneMsg });

      if (cfg.handoff && i < AGENTS.length - 1) {
        const next = AGENTS[i + 1];
        setPulseEdge(cfg.id);
        pushLog({ type: "handoff", agentId: cfg.id, to: next.name, text: cfg.handoff });
        await wait(HANDOFF_PAUSE);
        if (!alive()) return;
        setPulseEdge(null);
      }
    }

    setOverallEnd(Date.now());
    pushLog({ type: "celebration", text: "Firebox AI successfully built your application." });
    setPhase("done");
  }, [pushLog, patchAgent]);

  const resetBuild = () => {
    buildIdRef.current += 1;
    setPhase("idle");
    setAgents(initAgents());
    setLogs([]);
    setOverallStart(null);
    setOverallEnd(null);
    setPulseEdge(null);
  };

  /* ---------------------------- derived stats ---------------------------- */
  const now = Date.now();
  let completedUnits = 0;
  let remainingMs = 0;
  agents.forEach((a, idx) => {
    const cfg = AGENTS[idx];
    if (a.status === "done") {
      completedUnits += cfg.tasks.length;
    } else if (a.status === "active" || a.status === "error") {
      const frac = a.taskStart
        ? Math.min(1, Math.max(0, (now - a.taskStart) / a.taskMs))
        : 0;
      completedUnits += a.taskIndex + (a.status === "active" ? frac : 0);
      for (let t = a.taskIndex; t < cfg.tasks.length; t++) {
        remainingMs += t === a.taskIndex ? cfg.tasks[t].ms * (1 - frac) : cfg.tasks[t].ms;
      }
      for (let j = idx + 1; j < AGENTS.length; j++) {
        remainingMs += AGENTS[j].tasks.reduce((s, tk) => s + tk.ms, 0);
      }
    } else if (a.status === "queued") {
      remainingMs += cfg.tasks.reduce((s, tk) => s + tk.ms, 0);
    }
  });
  const overallPct = Math.min(100, (completedUnits / TOTAL_UNITS) * 100);
  const elapsedMs = overallStart ? (overallEnd || now) - overallStart : 0;

  /* ----------------------------------------------------------------------- */

  return (
    <div
      className="min-h-screen w-full flex items-start sm:items-center justify-center p-4 sm:p-8"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -10%, #161C2A 0%, #0A0D13 60%)",
        fontFamily: FONT_BODY,
        color: C.text,
      }}
    >
      <GlobalStyle />
      <div className="w-full max-w-2xl">
        {phase === "idle" ? (
          <IdleView prompt={prompt} setPrompt={setPrompt} onBuild={runBuild} />
        ) : (
          <ConsoleView
            phase={phase}
            agents={agents}
            logs={logs}
            pulseEdge={pulseEdge}
            overallPct={overallPct}
            elapsedMs={elapsedMs}
            remainingMs={remainingMs}
            onReset={resetBuild}
            logEndRef={logEndRef}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Idle / prompt view                                                     */
/* ---------------------------------------------------------------------- */
function IdleView({ prompt, setPrompt, onBuild }) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-10"
      style={{ background: C.panel, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} color="#8B7FF6" />
        <span
          className="text-xs tracking-widest uppercase"
          style={{ color: C.faint, fontFamily: FONT_MONO }}
        >
          Firebox AI Studio
        </span>
      </div>
      <h1
        className="text-2xl sm:text-3xl font-semibold mb-2"
        style={{ fontFamily: FONT_DISPLAY }}
      >
        Describe the app you want built.
      </h1>
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        A team of seven specialist agents will plan, build, secure, test, and
        deploy it — live, in front of you.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full rounded-xl p-4 text-sm outline-none resize-none mb-6"
        style={{
          background: "#0D1119",
          border: `1px solid ${C.border}`,
          color: C.text,
          fontFamily: FONT_MONO,
        }}
      />

      <button
        onClick={onBuild}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-transform active:scale-95"
        style={{
          background: "linear-gradient(135deg,#8B7FF6,#45C4E0)",
          color: "#0A0D13",
          fontFamily: FONT_DISPLAY,
        }}
      >
        <Play size={16} fill="#0A0D13" />
        Build
      </button>

      <div className="mt-6 flex flex-wrap gap-2">
        {AGENTS.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
            style={{
              border: `1px solid ${C.border}`,
              color: C.muted,
              fontFamily: FONT_MONO,
            }}
          >
            <a.icon size={12} color={a.color} />
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Live console view                                                      */
/* ---------------------------------------------------------------------- */
function ConsoleView({
  phase, agents, logs, pulseEdge, overallPct, elapsedMs, remainingMs, onReset, logEndRef,
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: C.panel, border: `1px solid ${C.border}` }}
    >
      {/* header */}
      <div className="p-5 sm:p-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} color="#8B7FF6" />
            <span
              className="text-xs tracking-widest uppercase"
              style={{ color: C.faint, fontFamily: FONT_MONO }}
            >
              Firebox AI Studio
            </span>
          </div>
          <StatusPill phase={phase} />
        </div>

        <div className="flex items-end justify-between mb-2">
          <span className="text-sm font-medium" style={{ fontFamily: FONT_DISPLAY }}>
            {phase === "done" ? "Build complete" : "Building your application…"}
          </span>
          <span
            className="text-xs tabular-nums"
            style={{ color: C.muted, fontFamily: FONT_MONO }}
          >
            {Math.round(overallPct)}%
          </span>
        </div>

        <div
          className="h-2 w-full rounded-full overflow-hidden"
          style={{ background: "#1A2030" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${overallPct}%`,
              background: "linear-gradient(90deg,#8B7FF6,#45C4E0,#34D399,#F2545B,#5B8DEF,#FF8A3D)",
              transition: "width 200ms linear",
            }}
          />
        </div>

        <div className="flex items-center gap-4 mt-3">
          <span
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: C.muted, fontFamily: FONT_MONO }}
          >
            <Clock size={12} /> Elapsed {fmtClock(elapsedMs)}
          </span>
          {phase !== "done" && (
            <span
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: C.muted, fontFamily: FONT_MONO }}
            >
              <Loader2 size={12} className="animate-spin" /> ETA {fmtClock(remainingMs)}
            </span>
          )}
        </div>
      </div>

      {/* agent pipeline */}
      <div className="p-5 sm:p-6" style={{ borderBottom: `1px solid ${C.border}` }}>
        {agents.map((a, idx) => (
          <AgentRow
            key={a.id}
            cfg={AGENTS[idx]}
            state={a}
            isLast={idx === AGENTS.length - 1}
            pulsing={pulseEdge === a.id}
          />
        ))}
      </div>

      {/* live log terminal */}
      <div className="p-5 sm:p-6">
        <div
          className="flex items-center gap-2 mb-2 text-xs"
          style={{ color: C.faint, fontFamily: FONT_MONO }}
        >
          <Terminal size={12} /> LIVE BUILD LOG
        </div>
        <div
          className="rounded-xl p-3 h-40 overflow-y-auto firebox-scroll"
          style={{ background: "#0D1119", border: `1px solid ${C.border}` }}
        >
          {logs.map((l) => (
            <LogLine key={l.id} entry={l} />
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {phase === "done" && (
        <div
          className="p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} color={C.success} />
            <span className="text-sm" style={{ fontFamily: FONT_DISPLAY }}>
              Your application is ready.
            </span>
          </div>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium"
            style={{
              border: `1px solid ${C.borderHi}`,
              color: C.text,
              fontFamily: FONT_MONO,
            }}
          >
            <RotateCcw size={13} /> Run another build
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ phase }) {
  const map = {
    running: { text: "Live", color: "#34D399" },
    done: { text: "Complete", color: "#5B8DEF" },
  };
  const s = map[phase] || map.running;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
      style={{ border: `1px solid ${C.border}`, color: s.color, fontFamily: FONT_MONO }}
    >
      <span
        className={phase === "running" ? "animate-pulse" : ""}
        style={{
          width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block",
        }}
      />
      {s.text}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/*  Single agent row (icon rail + card)                                    */
/* ---------------------------------------------------------------------- */
function AgentRow({ cfg, state, isLast, pulsing }) {
  const Icon = cfg.icon;
  const now = Date.now();
  const totalTasks = cfg.tasks.length;

  let pct = 0;
  if (state.status === "done") pct = 100;
  else if (state.status === "active" || state.status === "error") {
    const frac = state.taskStart
      ? Math.min(1, Math.max(0, (now - state.taskStart) / state.taskMs))
      : 0;
    pct = ((state.taskIndex + (state.status === "active" ? frac : 0)) / totalTasks) * 100;
  }

  const isActive = state.status === "active";
  const isError = state.status === "error";
  const isDone = state.status === "done";
  const isQueued = state.status === "queued";

  return (
    <div className="flex gap-4">
      {/* rail */}
      <div className="flex flex-col items-center">
        <div
          className={isActive ? "firebox-pulse-ring" : ""}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isQueued ? "#161B26" : `${cfg.color}22`,
            border: `1.5px solid ${isQueued ? C.border : cfg.color}`,
            transition: "all 300ms ease",
            flexShrink: 0,
          }}
        >
          {isError ? (
            <AlertTriangle size={16} color={C.error} />
          ) : isDone ? (
            <CheckCircle2 size={16} color={cfg.color} />
          ) : (
            <Icon size={16} color={isQueued ? C.faint : cfg.color} />
          )}
        </div>
        {!isLast && (
          <div
            className="relative"
            style={{ width: 2, flex: 1, minHeight: 28, marginTop: 2, marginBottom: 2 }}
          >
            <div
              style={{
                width: "100%", height: "100%", borderRadius: 2,
                background: isDone ? `linear-gradient(${cfg.color}, ${C.border})` : C.border,
                transition: "background 400ms ease",
              }}
            />
            {pulsing && <div className="firebox-travel-dot" style={{ background: cfg.color }} />}
          </div>
        )}
      </div>

      {/* card */}
      <div className={`flex-1 rounded-xl p-4 mb-3 ${isLast ? "" : ""}`}
        style={{
          background: isActive ? C.panelHi : "transparent",
          border: `1px solid ${isActive ? cfg.color + "55" : "transparent"}`,
          boxShadow: isActive ? `0 0 24px -8px ${cfg.color}66` : "none",
          transition: "all 300ms ease",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-sm font-medium"
            style={{
              fontFamily: FONT_DISPLAY,
              color: isQueued ? C.faint : C.text,
            }}
          >
            {cfg.name}
          </span>
          <span
            className="text-xs"
            style={{ color: isDone ? cfg.color : C.faint, fontFamily: FONT_MONO }}
          >
            {isDone ? "done" : isError ? "retrying…" : isActive ? "active" : "queued"}
          </span>
        </div>

        <div className="text-xs mb-2 min-h-[16px]" style={{ color: C.muted, fontFamily: FONT_MONO }}>
          {isDone && cfg.doneMsg}
          {isActive && (
            <>
              {state.taskLabel}
              <span className="firebox-caret">▍</span>
            </>
          )}
          {isError && "Vulnerability found — patching…"}
          {isQueued && "Waiting in queue"}
        </div>

        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "#1A2030" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: isError ? C.error : cfg.color,
              transition: "width 200ms linear",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Log line renderer                                                      */
/* ---------------------------------------------------------------------- */
function LogLine({ entry }) {
  const cfg = AGENTS.find((a) => a.id === entry.agentId);
  const color = cfg ? cfg.color : C.muted;
  const time = new Date(entry.time).toLocaleTimeString([], {
    hour12: false, minute: "2-digit", second: "2-digit",
  });

  let icon = null;
  let text = entry.text;
  let textColor = C.muted;

  if (entry.type === "success") {
    icon = <CheckCircle2 size={11} color={C.success} />;
    textColor = C.success;
  } else if (entry.type === "error") {
    icon = <AlertTriangle size={11} color={C.error} />;
    textColor = C.error;
  } else if (entry.type === "retry") {
    icon = <RotateCcw size={11} color="#F0A93A" />;
    textColor = "#F0A93A";
  } else if (entry.type === "handoff") {
    icon = <ArrowRight size={11} color={color} />;
    text = `${cfg?.name} → ${entry.to}: ${entry.text}`;
  } else if (entry.type === "chat") {
    icon = <MessageCircle size={11} color={color} />;
    text = `${cfg?.name} → ${entry.to}: “${entry.text}”`;
    textColor = C.faint;
  } else if (entry.type === "celebration") {
    icon = <Sparkles size={11} color="#8B7FF6" />;
    textColor = C.text;
  } else if (entry.type === "system") {
    text = entry.agentId ? `${cfg?.name} ${entry.text}` : entry.text;
  } else if (cfg) {
    text = `${cfg.name}: ${entry.text}`;
  }

  return (
    <div
      className="firebox-log-line flex items-start gap-2 py-0.5 text-xs"
      style={{ fontFamily: FONT_MONO }}
    >
      <span style={{ color: C.faint, flexShrink: 0 }}>{time}</span>
      <span style={{ flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <span style={{ color: textColor }}>{text}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Global styles / keyframes                                              */
/* ---------------------------------------------------------------------- */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

      @keyframes firebox-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
      .firebox-caret { display:inline-block; margin-left:2px; animation: firebox-blink 1s step-start infinite; }

      @keyframes firebox-ring {
        0% { box-shadow: 0 0 0 0 rgba(139,127,246,0.35); }
        70% { box-shadow: 0 0 0 8px rgba(139,127,246,0); }
        100% { box-shadow: 0 0 0 0 rgba(139,127,246,0); }
      }
      .firebox-pulse-ring { animation: firebox-ring 1.8s ease-out infinite; }

      @keyframes firebox-fade-in {
        from { opacity:0; transform: translateY(3px); }
        to { opacity:1; transform: translateY(0); }
      }
      .firebox-log-line { animation: firebox-fade-in 200ms ease-out; }

      @keyframes firebox-travel {
        0% { top: -6px; opacity: 0; }
        15% { opacity: 1; }
        85% { opacity: 1; }
        100% { top: 100%; opacity: 0; }
      }
      .firebox-travel-dot {
        position: absolute; left: 50%; transform: translateX(-50%);
        width: 6px; height: 6px; border-radius: 50%;
        animation: firebox-travel 650ms ease-in-out;
        box-shadow: 0 0 8px 2px currentColor;
      }

      .firebox-scroll::-webkit-scrollbar { width: 6px; }
      .firebox-scroll::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      .firebox-scroll::-webkit-scrollbar-track { background: transparent; }

      @media (prefers-reduced-motion: reduce) {
        .firebox-pulse-ring, .firebox-caret, .firebox-log-line, .firebox-travel-dot { animation: none !important; }
      }
    `}</style>
  );
}
