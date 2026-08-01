import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Server, Palette, Database, ShieldCheck, FlaskConical, Rocket,
  CheckCircle2, AlertTriangle, Loader2, Play, Sparkles,
  Terminal, Copy, Check, ChevronRight, ChevronDown, RotateCcw, History,
  X, PanelLeft, Files, Eye, Code2, ExternalLink, FileText,
  FileCode, FileJson, FolderOpen,
} from "lucide-react";

/* ─── Design tokens ───────────────────────────────────────────────────────── */
const C = {
  bg:        "#080B11", panel:    "#0E1219", panelHi:  "#141921",
  border:    "#1E2535", borderHi: "#2A3448",
  text:      "#E8EBF2", muted:    "#7A8399", faint:    "#3A4255",
  accent:    "#6D7FFF", accentGlow: "rgba(109,127,255,0.15)",
  success:   "#34D399", error:    "#F2545B",
};
const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO    = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_BODY    = "'Inter', ui-sans-serif, system-ui, sans-serif";

/* ─── Agent metadata ──────────────────────────────────────────────────────── */
const AGENT_META = [
  { name: "Architect",  Icon: Brain,        color: "#A78BFA" },
  { name: "Backend",    Icon: Server,       color: "#60A5FA" },
  { name: "Frontend",   Icon: Palette,      color: "#F472B6" },
  { name: "Database",   Icon: Database,     color: "#34D399" },
  { name: "Security",   Icon: ShieldCheck,  color: "#FBBF24" },
  { name: "QA",         Icon: FlaskConical, color: "#FB923C" },
  { name: "Deployment", Icon: Rocket,       color: "#38BDF8" },
];

function agentColor(name) {
  return AGENT_META.find((a) => a.name === name)?.color || C.accent;
}
function agentMeta(name) {
  return AGENT_META.find((a) => a.name === name) || AGENT_META[0];
}

/* ─── File utilities ──────────────────────────────────────────────────────── */
function fileIcon(path) {
  const ext = path.split(".").pop().toLowerCase();
  const base = path.split("/").pop().toLowerCase();
  if (base === "dockerfile")           return <FileCode size={12} color="#38BDF8" />;
  if (["json","lock"].includes(ext))   return <FileJson size={12} color="#FBBF24" />;
  if (["md","txt"].includes(ext))      return <FileText size={12} color="#9CA3AF" />;
  if (["js","jsx","ts","tsx"].includes(ext)) return <FileCode size={12} color="#60A5FA" />;
  if (["html","htm"].includes(ext))    return <FileCode size={12} color="#F472B6" />;
  if (["css","scss"].includes(ext))    return <FileCode size={12} color="#A78BFA" />;
  if (["py"].includes(ext))            return <FileCode size={12} color="#34D399" />;
  if (["yml","yaml","toml"].includes(ext)) return <FileCode size={12} color="#FB923C" />;
  return <FileText size={12} color={C.muted} />;
}

function isPreviewable(path) {
  const ext = path.split(".").pop().toLowerCase();
  return ["html","htm"].includes(ext);
}

/* ─── Small reusable components ───────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    idle:    { label: "Idle",    bg: C.faint,                    text: C.muted,   dot: C.faint },
    working: { label: "Working", bg: "rgba(109,127,255,0.15)",   text: C.accent,  dot: C.accent },
    done:    { label: "Done",    bg: "rgba(52,211,153,0.12)",    text: C.success, dot: C.success },
    error:   { label: "Error",   bg: "rgba(242,84,91,0.12)",     text: C.error,   dot: C.error },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding:"2px 7px", borderRadius:20, fontSize:10, fontFamily:FONT_BODY,
      background:s.bg, color:s.text, fontWeight:700, letterSpacing:"0.04em",
    }}>
      <span style={{
        width:5, height:5, borderRadius:"50%", background:s.dot, flexShrink:0,
        animation: status==="working" ? "pulse 1.2s ease-in-out infinite" : "none",
      }}/>
      {s.label}
    </span>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
    }} style={{
      display:"flex", alignItems:"center", gap:5, padding:"4px 10px",
      borderRadius:6, border:`1px solid ${C.border}`, background:C.panel,
      color:C.muted, fontSize:12, fontFamily:FONT_BODY, cursor:"pointer",
    }}>
      {copied ? <Check size={12} color={C.success}/> : <Copy size={12}/>}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ─── File Tree ───────────────────────────────────────────────────────────── */
function FileTree({ files, agentStates, selectedFile, onSelectFile, activeAgent }) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapse = (agent) =>
    setCollapsed((p) => ({ ...p, [agent]: !p[agent] }));

  if (files.length === 0) {
    return (
      <div style={{ padding:20, textAlign:"center" }}>
        <Files size={24} color={C.faint} style={{ marginBottom:8 }} />
        <div style={{ fontSize:12, color:C.faint, lineHeight:1.6 }}>
          Files appear here<br />as agents complete
        </div>
      </div>
    );
  }

  // Group by agent, preserving AGENT_META order
  const grouped = {};
  for (const a of AGENT_META) grouped[a.name] = [];
  for (const f of files) {
    if (!grouped[f.agent]) grouped[f.agent] = [];
    grouped[f.agent].push(f);
  }

  return (
    <div style={{ padding:"6px 0" }}>
      {AGENT_META.map(({ name, Icon, color }) => {
        const agentFiles = grouped[name] || [];
        if (agentFiles.length === 0) return null;
        const isOpen = !collapsed[name];
        const agentState = agentStates.find((a) => a.name === name);
        return (
          <div key={name}>
            <div
              onClick={() => toggleCollapse(name)}
              style={{
                display:"flex", alignItems:"center", gap:6,
                padding:"5px 10px", cursor:"pointer",
                borderRadius:7, margin:"0 4px",
                transition:"background 0.1s",
              }}
              className="tree-group"
            >
              {isOpen ? <ChevronDown size={11} color={C.muted}/> : <ChevronRight size={11} color={C.muted}/>}
              <Icon size={12} color={color}/>
              <span style={{ fontSize:11, fontWeight:700, color:C.text, flex:1, letterSpacing:"0.02em" }}>
                {name}
              </span>
              <span style={{ fontSize:10, color:C.faint }}>{agentFiles.length}</span>
            </div>
            {isOpen && agentFiles.map((f) => {
              const isSelected = selectedFile?.path === f.path && selectedFile?.agent === f.agent;
              const filename = f.path.split("/").pop();
              const dir = f.path.includes("/") ? f.path.split("/").slice(0,-1).join("/") + "/" : "";
              return (
                <div
                  key={f.path}
                  onClick={() => onSelectFile(f)}
                  className="tree-file"
                  title={f.path}
                  style={{
                    display:"flex", alignItems:"center", gap:7,
                    padding:"5px 10px 5px 26px", cursor:"pointer", borderRadius:7,
                    margin:"1px 4px",
                    background: isSelected ? C.accentGlow : "transparent",
                    border:`1px solid ${isSelected ? C.borderHi : "transparent"}`,
                    transition:"all 0.12s",
                  }}
                >
                  {fileIcon(f.path)}
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:12, color: isSelected ? C.text : C.muted, fontWeight: isSelected ? 600 : 400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {filename}
                    </div>
                    {dir && <div style={{ fontSize:10, color:C.faint, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{dir}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function FireboxAIStudio() {
  const [phase, setPhase] = useState("idle");
  const [description, setDescription] = useState("");
  const [agentStates, setAgentStates] = useState(
    AGENT_META.map((a) => ({ name:a.name, status:"idle", streaming:"" }))
  );
  const [activeAgent, setActiveAgent]   = useState(null);
  const [allFiles, setAllFiles]         = useState([]);      // all parsed files from agents
  const [selectedFile, setSelectedFile] = useState(null);    // {path, content, language, agent}
  const [viewMode, setViewMode]         = useState("code");  // "code" | "preview"
  const [errorMsg, setErrorMsg]         = useState("");
  const [recentBuilds, setRecentBuilds] = useState([]);
  const [showHistory, setShowHistory]   = useState(false);
  const [cardOpen, setCardOpen]         = useState(true);
  const [treeOpen, setTreeOpen]         = useState(true);

  const terminalRef  = useRef(null);
  const esRef        = useRef(null);
  const streamingRef = useRef({});

  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [agentStates]);

  useEffect(() => {
    fetch("/api/builds").then((r) => r.json()).then(setRecentBuilds).catch(()=>{});
  }, []);

  const updateAgent = useCallback((name, patch) =>
    setAgentStates((prev) => prev.map((a) => a.name===name ? {...a,...patch} : a)), []);

  const startBuild = useCallback(async () => {
    if (!description.trim()) return;
    setPhase("building");
    setErrorMsg("");
    streamingRef.current = {};
    setAgentStates(AGENT_META.map((a) => ({ name:a.name, status:"idle", streaming:"" })));
    setAllFiles([]);
    setSelectedFile(null);
    setViewMode("code");
    setActiveAgent(null);
    setCardOpen(true);
    setTreeOpen(true);

    let buildId;
    try {
      const res = await fetch("/api/build", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      buildId = data.buildId;
    } catch (err) { setPhase("error"); setErrorMsg(err.message); return; }

    const es = new EventSource(`/api/build/${buildId}/events`);
    esRef.current = es;

    es.addEventListener("agent-start", (e) => {
      const { agent } = JSON.parse(e.data);
      setActiveAgent(agent);
      updateAgent(agent, { status:"working", streaming:"" });
      streamingRef.current[agent] = "";
    });

    es.addEventListener("agent-token", (e) => {
      const { agent, token } = JSON.parse(e.data);
      streamingRef.current[agent] = (streamingRef.current[agent]||"") + token;
      updateAgent(agent, { streaming: streamingRef.current[agent] });
    });

    es.addEventListener("agent-complete", (e) => {
      const { agent, files } = JSON.parse(e.data);
      updateAgent(agent, { status:"done", streaming:"" });
      if (files?.length) {
        setAllFiles((prev) => {
          const newFiles = [...prev, ...files];
          // Auto-select first file from first agent
          if (prev.length === 0 && files.length > 0) setSelectedFile(files[0]);
          return newFiles;
        });
      }
    });

    es.addEventListener("agent-error", (e) => {
      const { agent, message } = JSON.parse(e.data);
      updateAgent(agent, { status:"error", streaming:"" });
      setErrorMsg(`${agent}: ${message}`);
    });

    es.addEventListener("build-complete", () => {
      setPhase("complete"); setActiveAgent(null); es.close();
      fetch("/api/builds").then((r)=>r.json()).then(setRecentBuilds).catch(()=>{});
    });

    es.addEventListener("build-error", (e) => {
      const { message } = JSON.parse(e.data);
      setPhase("error"); setErrorMsg(message); es.close();
    });

    es.onerror = () => { setPhase("error"); setErrorMsg("Connection lost."); es.close(); };
  }, [description, updateAgent]);

  const reset = () => {
    esRef.current?.close();
    setPhase("idle"); setDescription(""); setAllFiles([]); setSelectedFile(null);
    setAgentStates(AGENT_META.map((a) => ({ name:a.name, status:"idle", streaming:"" })));
    setActiveAgent(null); setErrorMsg(""); streamingRef.current = {};
    setCardOpen(true); setViewMode("code");
  };

  const doneCount = agentStates.filter((a) => a.status==="done").length;
  const progress  = (doneCount / AGENT_META.length) * 100;

  /* preview blob URL for HTML files */
  const previewUrl = useCallback(() => {
    if (!selectedFile) return null;
    const blob = new Blob([selectedFile.content], { type:"text/html" });
    return URL.createObjectURL(blob);
  }, [selectedFile]);

  const openInNewTab = () => {
    const url = previewUrl();
    if (url) { window.open(url, "_blank"); setTimeout(()=>URL.revokeObjectURL(url), 3000); }
  };

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};overflow:hidden}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.faint};border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .icon-btn:hover{background:${C.panelHi}!important;color:${C.text}!important}
        .tree-group:hover{background:${C.panelHi}!important}
        .tree-file:hover{background:${C.panelHi}!important}
        .build-btn:hover{filter:brightness(1.12)}
        .build-btn:active{transform:scale(0.98)}
        .history-row:hover{background:${C.panelHi}!important}
        .tab-btn:hover{background:${C.panelHi}!important}
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:C.bg, fontFamily:FONT_BODY, color:C.text, overflow:"hidden" }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 18px", borderBottom:`1px solid ${C.border}`,
          background:C.panel, flexShrink:0, zIndex:30,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button onClick={()=>setCardOpen(o=>!o)} className="icon-btn" title="Toggle pipeline" style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`,
              background: cardOpen ? C.accentGlow : "transparent",
              color: cardOpen ? C.accent : C.muted, cursor:"pointer", transition:"all 0.15s",
            }}><PanelLeft size={14}/></button>

            <button onClick={()=>setTreeOpen(o=>!o)} className="icon-btn" title="Toggle file tree" style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:30, height:30, borderRadius:8, border:`1px solid ${C.border}`,
              background: treeOpen ? C.accentGlow : "transparent",
              color: treeOpen ? C.accent : C.muted, cursor:"pointer", transition:"all 0.15s",
            }}><Files size={14}/></button>

            <Sparkles size={15} color={C.accent}/>
            <span style={{ fontFamily:FONT_DISPLAY, fontWeight:700, fontSize:14, letterSpacing:"0.05em" }}>
              FIREBOX AI STUDIO
            </span>
            <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:C.accentGlow, color:C.accent, fontWeight:700 }}>LIVE</span>
          </div>
          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
            {phase !== "idle" && (
              <button onClick={reset} className="icon-btn" style={{
                display:"flex", alignItems:"center", gap:5, padding:"5px 11px",
                borderRadius:7, border:`1px solid ${C.border}`,
                background:"transparent", color:C.muted, fontSize:12, fontFamily:FONT_BODY, cursor:"pointer",
              }}><RotateCcw size={11}/> New Build</button>
            )}
            <button onClick={()=>setShowHistory(s=>!s)} className="icon-btn" style={{
              display:"flex", alignItems:"center", gap:5, padding:"5px 11px",
              borderRadius:7, border:`1px solid ${C.border}`,
              background: showHistory ? C.panelHi : "transparent",
              color:C.muted, fontSize:12, fontFamily:FONT_BODY, cursor:"pointer",
            }}><History size={11}/> History</button>
          </div>
        </header>

        {/* ── History drawer ────────────────────────────────────────────────── */}
        {showHistory && (
          <div style={{ background:C.panel, borderBottom:`1px solid ${C.border}`, padding:"12px 18px", animation:"fadeIn 0.2s", zIndex:20 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:7, fontWeight:700, letterSpacing:"0.06em" }}>RECENT BUILDS</div>
            {recentBuilds.length === 0
              ? <div style={{ fontSize:12, color:C.faint }}>No builds yet.</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {recentBuilds.map((b) => (
                    <div key={b._id} className="history-row" style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"6px 11px", borderRadius:7, background:C.panelHi,
                      border:`1px solid ${C.border}`, animation:"fadeIn 0.2s",
                    }}>
                      <div style={{ fontSize:12, color:C.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.description}</div>
                      <div style={{ display:"flex", gap:10, alignItems:"center", marginLeft:10, flexShrink:0 }}>
                        <span style={{ fontSize:11, fontWeight:600, color: b.status==="complete"?C.success:b.status==="failed"?C.error:C.muted }}>{b.status}</span>
                        <span style={{ fontSize:11, color:C.faint }}>{new Date(b.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ── Main area ─────────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>

          {/* ── File tree sidebar ──────────────────────────────────────────── */}
          {treeOpen && (
            <div style={{
              width:220, flexShrink:0, display:"flex", flexDirection:"column",
              borderRight:`1px solid ${C.border}`, background:C.panel, overflow:"hidden",
            }}>
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"9px 12px", borderBottom:`1px solid ${C.border}`, flexShrink:0,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <FolderOpen size={13} color={C.accent}/>
                  <span style={{ fontSize:11, fontWeight:700, color:C.text, letterSpacing:"0.04em" }}>FILES</span>
                </div>
                <span style={{ fontSize:11, color:C.faint }}>{allFiles.length} files</span>
              </div>
              <div style={{ flex:1, overflowY:"auto" }}>
                <FileTree
                  files={allFiles}
                  agentStates={agentStates}
                  selectedFile={selectedFile}
                  onSelectFile={(f) => { setSelectedFile(f); setViewMode("code"); }}
                  activeAgent={activeAgent}
                />
              </div>
            </div>
          )}

          {/* ── Code / Preview viewer ─────────────────────────────────────── */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:C.bg }}>

            {/* Viewer toolbar */}
            {selectedFile ? (
              <>
                <div style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"8px 16px", borderBottom:`1px solid ${C.border}`,
                  background:C.panel, flexShrink:0, gap:10,
                }}>
                  {/* File breadcrumb */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0, flex:1 }}>
                    {(() => { const m=agentMeta(selectedFile.agent); return <m.Icon size={13} color={m.color}/>; })()}
                    <span style={{ fontSize:12, color:C.faint, flexShrink:0 }}>{selectedFile.agent} /</span>
                    {fileIcon(selectedFile.path)}
                    <span style={{ fontSize:13, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {selectedFile.path}
                    </span>
                    <span style={{ fontSize:10, color:C.faint, flexShrink:0, background:C.panelHi, padding:"2px 6px", borderRadius:4, fontFamily:FONT_MONO }}>
                      {selectedFile.language}
                    </span>
                  </div>
                  {/* Actions */}
                  <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
                    {isPreviewable(selectedFile.path) && (
                      <>
                        <div style={{ display:"flex", borderRadius:7, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                          {["code","preview"].map((mode) => (
                            <button key={mode} onClick={()=>setViewMode(mode)} className="tab-btn" style={{
                              display:"flex", alignItems:"center", gap:5, padding:"4px 10px",
                              background: viewMode===mode ? C.accent : "transparent",
                              color: viewMode===mode ? "#fff" : C.muted,
                              fontSize:11, fontFamily:FONT_BODY, fontWeight:600, cursor:"pointer",
                              border:"none", borderLeft: mode==="preview" ? `1px solid ${C.border}` : "none",
                              transition:"all 0.15s",
                            }}>
                              {mode==="code" ? <Code2 size={11}/> : <Eye size={11}/>}
                              {mode.charAt(0).toUpperCase()+mode.slice(1)}
                            </button>
                          ))}
                        </div>
                        <button onClick={openInNewTab} className="icon-btn" title="Open in new tab" style={{
                          display:"flex", alignItems:"center", justifyContent:"center",
                          width:28, height:28, borderRadius:7, border:`1px solid ${C.border}`,
                          background:"transparent", color:C.muted, cursor:"pointer",
                        }}><ExternalLink size={12}/></button>
                      </>
                    )}
                    <CopyButton text={selectedFile.content}/>
                  </div>
                </div>

                {/* Content area */}
                <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
                  {viewMode === "preview" && isPreviewable(selectedFile.path) ? (
                    <iframe
                      srcDoc={selectedFile.content}
                      sandbox="allow-scripts"
                      style={{ flex:1, border:"none", background:"#fff" }}
                      title="File Preview"
                    />
                  ) : (
                    <div style={{ flex:1, overflowY:"auto" }}>
                      <pre style={{
                        padding:"22px 24px", margin:0, fontFamily:FONT_MONO,
                        fontSize:13, lineHeight:1.75, color:"#C9D1E0",
                        whiteSpace:"pre-wrap", wordBreak:"break-word",
                      }}>
                        {selectedFile.content}
                      </pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Empty state */
              <div style={{
                flex:1, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:16, padding:40,
              }}>
                {phase === "idle" ? (
                  <>
                    <div style={{
                      width:58, height:58, borderRadius:18, background:C.accentGlow,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      border:`1px solid ${C.borderHi}`,
                    }}>
                      <Sparkles size={24} color={C.accent}/>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:17, fontFamily:FONT_DISPLAY, fontWeight:600, marginBottom:8 }}>
                        Your generated files will appear here
                      </div>
                      <div style={{ fontSize:13, color:C.muted, maxWidth:380, lineHeight:1.7 }}>
                        Open the pipeline panel, describe your app, and click Build. Each agent's files appear in the tree on the left as they're generated.
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:7, flexWrap:"wrap", justifyContent:"center" }}>
                      {AGENT_META.map((meta) => (
                        <span key={meta.name} style={{
                          display:"flex", alignItems:"center", gap:5,
                          padding:"4px 10px", borderRadius:20, fontSize:11,
                          background:C.panel, border:`1px solid ${C.border}`, color:C.muted,
                        }}>
                          <meta.Icon size={11} color={meta.color}/> {meta.name}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                    <Loader2 size={28} color={C.accent} style={{ animation:"spin 1s linear infinite" }}/>
                    <div style={{ fontSize:13, color:C.muted }}>
                      {allFiles.length > 0 ? `${allFiles.length} files generated — select one from the tree` : "Agents working… files will appear in the tree"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Floating pipeline card ──────────────────────────────────────── */}
          {cardOpen && (
            <div style={{
              position:"absolute", top:10, left: treeOpen ? 230 : 10,
              width:320, maxHeight:"calc(100% - 20px)",
              background:C.panel, border:`1px solid ${C.borderHi}`,
              borderRadius:14, boxShadow:"0 8px 40px rgba(0,0,0,0.55)",
              display:"flex", flexDirection:"column", overflow:"hidden",
              animation:"slideIn 0.2s ease", zIndex:20, transition:"left 0.2s ease",
            }}>
              {/* Card header */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"11px 13px", borderBottom:`1px solid ${C.border}`, flexShrink:0,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.text, fontFamily:FONT_DISPLAY, letterSpacing:"0.04em" }}>
                    AGENT PIPELINE
                  </span>
                  {phase!=="idle" && (
                    <span style={{ fontSize:11, color:C.muted }}>{doneCount}/{AGENT_META.length}</span>
                  )}
                </div>
                <button onClick={()=>setCardOpen(false)} className="icon-btn" style={{
                  display:"flex", alignItems:"center", justifyContent:"center",
                  width:24, height:24, borderRadius:6, border:`1px solid ${C.border}`,
                  background:"transparent", color:C.muted, cursor:"pointer",
                }}><X size={12}/></button>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY:"auto", flex:1 }}>
                {/* Prompt */}
                <div style={{ padding:"13px 13px 0" }}>
                  {phase === "idle" ? (
                    <>
                      <div style={{ fontSize:16, fontFamily:FONT_DISPLAY, fontWeight:700, marginBottom:4, lineHeight:1.3 }}>
                        Describe the app<br/>you want built.
                      </div>
                      <div style={{ fontSize:12, color:C.muted, marginBottom:11, lineHeight:1.6 }}>
                        7 AI agents generate every file — live.
                      </div>
                      <textarea
                        value={description}
                        onChange={(e)=>setDescription(e.target.value)}
                        onKeyDown={(e)=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) startBuild(); }}
                        placeholder="e.g. A task management app with real-time collaboration, user auth, analytics dashboard…"
                        rows={4}
                        style={{
                          width:"100%", background:C.panelHi, border:`1px solid ${C.border}`,
                          borderRadius:9, padding:"9px 11px", color:C.text, fontSize:12,
                          fontFamily:FONT_MONO, resize:"none", outline:"none", lineHeight:1.6,
                          transition:"border-color 0.2s",
                        }}
                        onFocus={(e)=>(e.target.style.borderColor=C.accent)}
                        onBlur={(e)=>(e.target.style.borderColor=C.border)}
                      />
                      <button onClick={startBuild} disabled={!description.trim()} className="build-btn" style={{
                        display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                        width:"100%", marginTop:9, padding:"10px", borderRadius:9, border:"none",
                        background: description.trim() ? "linear-gradient(135deg,#6D7FFF 0%,#A78BFA 100%)" : C.faint,
                        color:"#fff", fontSize:13, fontFamily:FONT_DISPLAY, fontWeight:600,
                        cursor: description.trim() ? "pointer" : "not-allowed", transition:"all 0.2s",
                      }}>
                        <Play size={12} fill="white"/> Build with AI
                      </button>
                      <div style={{ fontSize:11, color:C.faint, textAlign:"center", marginTop:5, marginBottom:3 }}>
                        Ctrl + Enter
                      </div>
                    </>
                  ) : (
                    <div style={{ padding:"9px 11px", borderRadius:9, background:C.panelHi, border:`1px solid ${C.border}`, marginBottom:4 }}>
                      <div style={{ fontSize:10, color:C.muted, marginBottom:3, fontWeight:700, letterSpacing:"0.06em" }}>BUILDING</div>
                      <div style={{ fontSize:12, color:C.text, lineHeight:1.5, fontFamily:FONT_MONO }}>{description}</div>
                    </div>
                  )}
                </div>

                {/* Progress */}
                {phase !== "idle" && (
                  <div style={{ padding:"9px 13px 0" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>
                        {phase==="complete" ? "✓ Complete" : `Agent ${Math.min(doneCount+(activeAgent?1:0),7)} of 7`}
                      </span>
                      <span style={{ fontSize:11, color:C.muted }}>{Math.round(progress)}%</span>
                    </div>
                    <div style={{ height:3, background:C.faint, borderRadius:2, overflow:"hidden" }}>
                      <div style={{
                        height:"100%", borderRadius:2, transition:"width 0.4s ease",
                        background: phase==="complete" ? C.success : "linear-gradient(90deg,#6D7FFF,#A78BFA)",
                        width:`${progress}%`,
                      }}/>
                    </div>
                  </div>
                )}

                {/* Agent rows */}
                <div style={{ padding:"9px 9px" }}>
                  {AGENT_META.map((meta) => {
                    const state  = agentStates.find((a) => a.name===meta.name);
                    const isActive = activeAgent === meta.name;
                    const agentFiles = allFiles.filter((f) => f.agent===meta.name);
                    return (
                      <div key={meta.name} style={{
                        display:"flex", alignItems:"center", gap:9, padding:"7px 8px",
                        borderRadius:9, marginBottom:3,
                        background: isActive ? C.accentGlow : "transparent",
                        border:`1px solid ${isActive ? C.borderHi : "transparent"}`,
                        transition:"all 0.15s",
                      }}>
                        <div style={{
                          width:30, height:30, borderRadius:8, flexShrink:0,
                          background: state.status==="idle" ? C.faint+"25" : `${meta.color}18`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          border:`1px solid ${state.status==="idle" ? "transparent" : meta.color+"30"}`,
                        }}>
                          {isActive
                            ? <Loader2 size={13} color={meta.color} style={{ animation:"spin 1s linear infinite" }}/>
                            : <meta.Icon size={13} color={state.status==="idle" ? C.faint : meta.color}/>
                          }
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:1 }}>
                            <span style={{ fontSize:12, fontWeight:600, color: state.status==="idle" ? C.muted : C.text }}>
                              {meta.name}
                            </span>
                            <StatusBadge status={state.status}/>
                          </div>
                          <div style={{ fontSize:10, color:C.faint }}>
                            {agentFiles.length > 0 ? `${agentFiles.length} file${agentFiles.length!==1?"s":""}` : "waiting…"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live terminal */}
                {activeAgent && (
                  <div style={{ margin:"0 9px 9px", borderRadius:9, overflow:"hidden", border:`1px solid ${C.borderHi}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 10px", background:C.panelHi, borderBottom:`1px solid ${C.border}` }}>
                      <Terminal size={11} color={C.accent}/>
                      <span style={{ fontSize:11, color:C.accent, fontWeight:600, fontFamily:FONT_MONO }}>{activeAgent} — generating…</span>
                    </div>
                    <div ref={terminalRef} style={{
                      height:90, overflowY:"auto", padding:"7px 10px",
                      background:"#060810", fontFamily:FONT_MONO, fontSize:11,
                      color:"#9BA8C0", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word",
                    }}>
                      {agentStates.find((a)=>a.name===activeAgent)?.streaming||""}
                      <span style={{ animation:"pulse 0.8s ease-in-out infinite", color:C.accent }}>▊</span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {errorMsg && (
                  <div style={{ margin:"0 9px 9px", padding:"8px 10px", borderRadius:9, background:"rgba(242,84,91,0.07)", border:"1px solid rgba(242,84,91,0.22)", display:"flex", gap:7 }}>
                    <AlertTriangle size={12} color={C.error} style={{ flexShrink:0, marginTop:1 }}/>
                    <span style={{ fontSize:12, color:C.error, lineHeight:1.5 }}>{errorMsg}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Complete banner ────────────────────────────────────────────────── */}
        {phase === "complete" && (
          <div style={{
            padding:"9px 18px", background:"rgba(52,211,153,0.07)",
            borderTop:`1px solid rgba(52,211,153,0.18)`,
            display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <CheckCircle2 size={14} color={C.success}/>
              <span style={{ fontSize:13, color:C.success, fontWeight:600 }}>
                All 7 agents completed — {allFiles.length} files generated.
              </span>
            </div>
            <button onClick={reset} style={{
              display:"flex", alignItems:"center", gap:5, padding:"4px 13px",
              borderRadius:7, border:`1px solid ${C.success}33`,
              background:"rgba(52,211,153,0.09)", color:C.success,
              fontSize:12, fontFamily:FONT_BODY, cursor:"pointer",
            }}><RotateCcw size={11}/> Build another</button>
          </div>
        )}
      </div>
    </>
  );
}
