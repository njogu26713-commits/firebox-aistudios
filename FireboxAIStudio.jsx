import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import MonacoEditor from "@monaco-editor/react";
import {
  Brain, Server, Palette, Database, ShieldCheck, FlaskConical, Rocket,
  CheckCircle2, AlertTriangle, Loader2, Play, Sparkles, Terminal,
  Copy, Check, ChevronRight, ChevronDown, RotateCcw, X, Search,
  GitBranch, Settings, Files, FileText, FileCode, FileJson,
  FolderOpen, Folder, History, Zap, Code2, Package,
} from "lucide-react";

/* ─── VS Code colour palette ─────────────────────────────────────────────── */
const VS = {
  /* structural */
  titleBar:    "#2D2D2D",
  activityBar: "#333333",
  sideBar:     "#252526",
  sideHead:    "#252526",
  editorBg:    "#1E1E1E",
  tabBar:      "#252526",
  activeTab:   "#1E1E1E",
  inactiveTab: "#2D2D2D",
  statusBar:   "#007ACC",
  panelBg:     "#1E1E1E",
  terminalBg:  "#1E1E1E",
  /* borders */
  border:      "#3D3D3D",
  borderLight: "#474747",
  /* text */
  text:        "#CCCCCC",
  textMuted:   "#8B8B8B",
  textFaint:   "#5A5A5A",
  textActive:  "#FFFFFF",
  /* accents */
  accent:      "#0078D4",
  accentHover: "#106EBE",
  success:     "#4EC994",
  error:       "#F48771",
  warning:     "#CCA700",
  /* agent colours */
  agentColors: {
    Architect:  "#A78BFA", Backend:   "#60A5FA", Frontend:  "#F472B6",
    Database:   "#34D399", Security:  "#FBBF24", QA:        "#FB923C",
    Deployment: "#38BDF8",
  },
};

const FONT_UI   = "'Inter', 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "'Cascadia Code', 'Fira Code', 'IBM Plex Mono', Menlo, monospace";

/* ─── Agent metadata ─────────────────────────────────────────────────────── */
const AGENT_META = [
  { name: "Architect",  Icon: Brain,        color: VS.agentColors.Architect },
  { name: "Backend",    Icon: Server,       color: VS.agentColors.Backend },
  { name: "Frontend",   Icon: Palette,      color: VS.agentColors.Frontend },
  { name: "Database",   Icon: Database,     color: VS.agentColors.Database },
  { name: "Security",   Icon: ShieldCheck,  color: VS.agentColors.Security },
  { name: "QA",         Icon: FlaskConical, color: VS.agentColors.QA },
  { name: "Deployment", Icon: Rocket,       color: VS.agentColors.Deployment },
];

/* ─── File utilities ─────────────────────────────────────────────────────── */
function getMonacoLang(path = "", lang = "") {
  const ext  = path.split(".").pop().toLowerCase();
  const base = path.split("/").pop().toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  return ({
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    json: "json", md: "markdown", yml: "yaml", yaml: "yaml",
    html: "html", css: "css", scss: "css", py: "python",
    sh: "shell", rb: "ruby", go: "go", rs: "rust",
    toml: "ini", env: "plaintext", txt: "plaintext", lock: "json", conf: "ini",
  })[ext] || lang || "plaintext";
}

function FileIcon({ path, size = 14 }) {
  const ext  = path.split(".").pop().toLowerCase();
  const base = path.split("/").pop().toLowerCase();
  if (base === "dockerfile")                       return <FileCode size={size} color="#38BDF8"/>;
  if (["json","lock","toml"].includes(ext))        return <FileJson  size={size} color="#FBBF24"/>;
  if (["md","txt","rst"].includes(ext))            return <FileText  size={size} color="#8B8B8B"/>;
  if (["js","jsx"].includes(ext))                  return <FileCode  size={size} color="#DCDCAA"/>;
  if (["ts","tsx"].includes(ext))                  return <FileCode  size={size} color="#60A5FA"/>;
  if (["html","htm"].includes(ext))                return <FileCode  size={size} color="#F16529"/>;
  if (["css","scss"].includes(ext))                return <FileCode  size={size} color="#A78BFA"/>;
  if (["py"].includes(ext))                        return <FileCode  size={size} color="#34D399"/>;
  if (["yml","yaml"].includes(ext))                return <FileCode  size={size} color="#FB923C"/>;
  if (["sh","bash","env"].includes(ext))           return <FileCode  size={size} color="#4EC994"/>;
  return <FileText size={size} color="#8B8B8B"/>;
}

/* ─── Build a nested directory tree from flat file list ─────────────────── */
function buildTree(files) {
  const root = { dirs: {}, files: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs[parts[i]]) node.dirs[parts[i]] = { dirs: {}, files: [] };
      node = node.dirs[parts[i]];
    }
    node.files.push({ ...f, name: parts[parts.length - 1] });
  }
  return root;
}

/* ─── Recursive tree node ─────────────────────────────────────────────────── */
function TreeNode({ name, node, depth = 0, onOpenFile, activeFilePath, expandedDirs, toggleDir }) {
  const indent = depth * 12 + 8;
  const dirs   = Object.entries(node.dirs).sort(([a], [b]) => a.localeCompare(b));
  const files  = node.files.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {dirs.map(([dirName, child]) => {
        const key     = `${depth}:${dirName}`;
        const isOpen  = expandedDirs.has(key);
        return (
          <React.Fragment key={dirName}>
            <div
              onClick={() => toggleDir(key)}
              className="tree-item"
              style={{ display:"flex", alignItems:"center", gap:4, paddingLeft:indent,
                height:22, cursor:"pointer", userSelect:"none" }}
            >
              {isOpen
                ? <ChevronDown size={12} color={VS.textMuted}/>
                : <ChevronRight size={12} color={VS.textMuted}/>}
              {isOpen
                ? <FolderOpen size={14} color="#DCB67A"/>
                : <Folder     size={14} color="#DCB67A"/>}
              <span style={{ fontSize:13, color:VS.text, whiteSpace:"nowrap" }}>{dirName}</span>
            </div>
            {isOpen && (
              <TreeNode
                name={dirName} node={child} depth={depth + 1}
                onOpenFile={onOpenFile} activeFilePath={activeFilePath}
                expandedDirs={expandedDirs} toggleDir={toggleDir}
              />
            )}
          </React.Fragment>
        );
      })}
      {files.map((f) => (
        <div
          key={f.path}
          onClick={() => onOpenFile(f)}
          className="tree-item"
          style={{
            display:"flex", alignItems:"center", gap:6,
            paddingLeft: indent + (dirs.length > 0 ? 0 : 16),
            height:22, cursor:"pointer", userSelect:"none",
            background: activeFilePath === f.path ? "#37373D" : "transparent",
            borderLeft: activeFilePath === f.path ? `2px solid ${VS.accent}` : "2px solid transparent",
          }}
        >
          <FileIcon path={f.path} size={14}/>
          <span style={{ fontSize:13, color: activeFilePath === f.path ? VS.textActive : VS.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {f.name}
          </span>
        </div>
      ))}
    </>
  );
}

/* ─── Status badge (agent) ───────────────────────────────────────────────── */
function AgentBadge({ status }) {
  const cfg = {
    idle:    { label:"Idle",    color:VS.textFaint,  dot:VS.textFaint  },
    working: { label:"Working", color:"#DCDCAA",     dot:"#DCDCAA"     },
    done:    { label:"Done",    color:VS.success,    dot:VS.success     },
    error:   { label:"Error",   color:VS.error,      dot:VS.error       },
  }[status] || { label:"Idle", color:VS.textFaint, dot:VS.textFaint };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:cfg.color }}>
      <span style={{
        width:6, height:6, borderRadius:"50%", background:cfg.dot, flexShrink:0,
        animation: status==="working" ? "pulse 1s ease-in-out infinite" : "none",
      }}/>
      {cfg.label}
    </span>
  );
}

/* ─── Monaco before-mount theme definition ───────────────────────────────── */
function defineFireboxTheme(monaco) {
  monaco.editor.defineTheme("firebox-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token:"comment",               foreground:"6A9955", fontStyle:"italic" },
      { token:"comment.doc",           foreground:"6A9955", fontStyle:"italic" },
      { token:"keyword",               foreground:"569CD6" },
      { token:"keyword.control",       foreground:"C586C0" },
      { token:"keyword.operator",      foreground:"569CD6" },
      { token:"string",                foreground:"CE9178" },
      { token:"string.escape",         foreground:"D7BA7D" },
      { token:"number",                foreground:"B5CEA8" },
      { token:"regexp",                foreground:"D16969" },
      { token:"type",                  foreground:"4EC9B0" },
      { token:"type.identifier",       foreground:"4EC9B0" },
      { token:"class",                 foreground:"4EC9B0" },
      { token:"function",              foreground:"DCDCAA" },
      { token:"function.call",         foreground:"DCDCAA" },
      { token:"variable",              foreground:"9CDCFE" },
      { token:"variable.predefined",   foreground:"4FC1FF" },
      { token:"variable.parameter",    foreground:"9CDCFE" },
      { token:"constant",              foreground:"4FC1FF" },
      { token:"property",              foreground:"9CDCFE" },
      { token:"operator",              foreground:"D4D4D4" },
      { token:"delimiter",             foreground:"D4D4D4" },
      { token:"tag",                   foreground:"569CD6" },
      { token:"attribute.name",        foreground:"9CDCFE" },
      { token:"attribute.value",       foreground:"CE9178" },
      { token:"namespace",             foreground:"4EC9B0" },
      { token:"decorator",             foreground:"D7BA7D" },
      { token:"metatag",               foreground:"4EC9B0" },
      { token:"metatag.content",       foreground:"CE9178" },
    ],
    colors: {
      "editor.background":                   "#1E1E1E",
      "editor.foreground":                   "#D4D4D4",
      "editor.lineHighlightBackground":      "#2A2D2E",
      "editor.lineHighlightBorder":          "#00000000",
      "editor.selectionBackground":          "#264F78",
      "editor.inactiveSelectionBackground":  "#3A3D41",
      "editor.wordHighlightBackground":      "#575757B8",
      "editorLineNumber.foreground":         "#858585",
      "editorLineNumber.activeForeground":   "#C6C6C6",
      "editorCursor.foreground":             "#AEAFAD",
      "editorCursor.background":             "#000000",
      "editorWhitespace.foreground":         "#3B3B3B",
      "editorIndentGuide.background":        "#404040",
      "editorIndentGuide.activeBackground":  "#707070",
      "editorRuler.foreground":              "#5A5A5A",
      "editorBracketMatch.background":       "#0064001A",
      "editorBracketMatch.border":           "#888888",
      "editorGutter.background":             "#1E1E1E",
      "editorWidget.background":             "#252526",
      "editorWidget.border":                 "#454545",
      "editorSuggestWidget.background":      "#252526",
      "editorSuggestWidget.border":          "#454545",
      "editorSuggestWidget.selectedBackground": "#062F4A",
      "editorHoverWidget.background":        "#252526",
      "editorHoverWidget.border":            "#454545",
      "scrollbar.shadow":                    "#000000",
      "scrollbarSlider.background":          "#79797966",
      "scrollbarSlider.hoverBackground":     "#646464B3",
      "scrollbarSlider.activeBackground":    "#BFBFBF66",
      "minimap.background":                  "#1A1A1A",
      "minimap.selectionHighlight":          "#264F78",
      "editorOverviewRuler.border":          "#7F7F7F4D",
      "editorOverviewRuler.findMatchForeground": "#EA5C00",
      "peekView.border":                     "#007ACC",
      "peekViewEditor.background":           "#001F33",
      "peekViewResult.background":           "#252526",
    },
  });
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main component                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function FireboxAIStudio() {
  /* build state */
  const [phase,       setPhase]       = useState("idle");
  const [description, setDescription] = useState("");
  const [agentStates, setAgentStates] = useState(
    AGENT_META.map((a) => ({ name:a.name, status:"idle", streaming:"" }))
  );
  const [activeAgent, setActiveAgent] = useState(null);
  const [allFiles,    setAllFiles]    = useState([]);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [recentBuilds,setRecentBuilds]= useState([]);

  /* editor state */
  const [openTabs,       setOpenTabs]       = useState([]);          // [{path,agent,content,language}]
  const [activeTabPath,  setActiveTabPath]  = useState(null);
  const [expandedDirs,   setExpandedDirs]   = useState(new Set());
  const [tabContents,    setTabContents]    = useState({});          // {path: currentContent}

  /* layout state */
  const [activity,    setActivity]    = useState("agents");           // "explorer"|"agents"|"search"|"git"
  const [sideOpen,    setSideOpen]    = useState(true);
  const [lineCol,     setLineCol]     = useState({ line:1, col:1 });
  const [historyOpen, setHistoryOpen] = useState(false);

  const terminalRef  = useRef(null);
  const esRef        = useRef(null);
  const streamingRef = useRef({});
  const editorRef    = useRef(null);

  /* scroll terminal to bottom */
  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [agentStates]);

  useEffect(() => {
    fetch("/api/builds").then(r => r.json()).then(setRecentBuilds).catch(()=>{});
  }, []);

  const updateAgent = useCallback((name, patch) =>
    setAgentStates(prev => prev.map(a => a.name===name ? {...a,...patch} : a)), []);

  /* ── Start build ──────────────────────────────────────────────────────── */
  const startBuild = useCallback(async () => {
    if (!description.trim()) return;
    setPhase("building");
    setErrorMsg("");
    streamingRef.current = {};
    setAgentStates(AGENT_META.map(a => ({ name:a.name, status:"idle", streaming:"" })));
    setAllFiles([]);
    setOpenTabs([]);
    setActiveTabPath(null);
    setTabContents({});
    setActiveAgent(null);
    setActivity("agents");

    let buildId;
    try {
      const res  = await fetch("/api/build", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      buildId = data.buildId;
    } catch (err) { setPhase("error"); setErrorMsg(err.message); return; }

    const es = new EventSource(`/api/build/${buildId}/events`);
    esRef.current = es;

    es.addEventListener("agent-start", e => {
      const { agent } = JSON.parse(e.data);
      setActiveAgent(agent);
      updateAgent(agent, { status:"working", streaming:"" });
      streamingRef.current[agent] = "";
    });

    es.addEventListener("agent-token", e => {
      const { agent, token } = JSON.parse(e.data);
      streamingRef.current[agent] = (streamingRef.current[agent]||"") + token;
      updateAgent(agent, { streaming: streamingRef.current[agent] });
    });

    es.addEventListener("agent-complete", e => {
      const { agent, files } = JSON.parse(e.data);
      updateAgent(agent, { status:"done", streaming:"" });
      if (files?.length) {
        setAllFiles(prev => {
          const next = [...prev, ...files];
          // Auto-open first file from first agent in editor
          if (prev.length === 0 && files.length > 0) {
            const f = files[0];
            setOpenTabs([f]);
            setActiveTabPath(f.path);
            setTabContents({ [f.path]: f.content });
            setActivity("explorer");
          }
          return next;
        });
        // Expand parent dirs in tree for newly added files
        files.forEach(f => {
          const parts = f.path.split("/");
          for (let i = 0; i < parts.length - 1; i++) {
            setExpandedDirs(prev => new Set([...prev, `${i}:${parts[i]}`]));
          }
        });
      }
    });

    es.addEventListener("agent-error", e => {
      const { agent, message } = JSON.parse(e.data);
      updateAgent(agent, { status:"error", streaming:"" });
      setErrorMsg(`${agent}: ${message}`);
    });

    es.addEventListener("build-complete", () => {
      setPhase("complete");
      setActiveAgent(null);
      es.close();
      fetch("/api/builds").then(r=>r.json()).then(setRecentBuilds).catch(()=>{});
    });

    es.addEventListener("build-error", e => {
      const { message } = JSON.parse(e.data);
      setPhase("error"); setErrorMsg(message); es.close();
    });

    es.onerror = () => { setPhase("error"); setErrorMsg("Connection lost."); es.close(); };
  }, [description, updateAgent]);

  /* ── Reset ────────────────────────────────────────────────────────────── */
  const reset = () => {
    esRef.current?.close();
    setPhase("idle"); setDescription(""); setAllFiles([]);
    setOpenTabs([]); setActiveTabPath(null); setTabContents({});
    setAgentStates(AGENT_META.map(a => ({name:a.name, status:"idle", streaming:""})));
    setActiveAgent(null); setErrorMsg(""); streamingRef.current = {};
    setActivity("agents");
  };

  /* ── Tab management ───────────────────────────────────────────────────── */
  const openFile = useCallback((file) => {
    setOpenTabs(prev => {
      if (prev.find(t => t.path === file.path)) return prev;
      return [...prev, file];
    });
    setActiveTabPath(file.path);
    if (!tabContents[file.path]) {
      setTabContents(prev => ({ ...prev, [file.path]: file.content }));
    }
  }, [tabContents]);

  const closeTab = useCallback((path, e) => {
    e?.stopPropagation();
    setOpenTabs(prev => {
      const idx  = prev.findIndex(t => t.path === path);
      const next = prev.filter(t => t.path !== path);
      if (activeTabPath === path) {
        setActiveTabPath(next[idx]?.path ?? next[idx-1]?.path ?? null);
      }
      return next;
    });
  }, [activeTabPath]);

  const toggleDir = useCallback((key) =>
    setExpandedDirs(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    }), []);

  /* ── Derived ──────────────────────────────────────────────────────────── */
  const doneCount   = agentStates.filter(a => a.status==="done").length;
  const progress    = (doneCount / AGENT_META.length) * 100;
  const activeFile  = openTabs.find(t => t.path === activeTabPath);
  const activeContent = activeFile ? (tabContents[activeFile.path] ?? activeFile.content) : "";

  // Group files by agent for the tree
  const filesByAgent = useMemo(() => {
    const m = {};
    AGENT_META.forEach(a => { m[a.name] = []; });
    allFiles.forEach(f => { if (m[f.agent]) m[f.agent].push(f); });
    return m;
  }, [allFiles]);

  // Breadcrumb parts
  const breadcrumbs = useMemo(() => {
    if (!activeFile) return [];
    return [activeFile.agent, ...activeFile.path.split("/")];
  }, [activeFile]);

  /* ── Monaco callbacks ─────────────────────────────────────────────────── */
  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monaco.editor.setTheme("firebox-dark");
    editor.onDidChangeCursorPosition(e => {
      setLineCol({ line: e.position.lineNumber, col: e.position.column });
    });
  }

  function handleEditorChange(value) {
    if (activeTabPath) {
      setTabContents(prev => ({ ...prev, [activeTabPath]: value }));
    }
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fira+Code:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#1E1E1E; overflow:hidden; }
        ::-webkit-scrollbar { width:8px; height:8px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#424242; border-radius:4px; }
        ::-webkit-scrollbar-thumb:hover { background:#555; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .tree-item:hover  { background:#2A2D2E !important; }
        .tab-item:hover   { background:#2D2D2D !important; }
        .act-btn:hover    { background:#444 !important; }
        .build-btn:hover  { filter:brightness(1.1); }
        .build-btn:active { transform:scale(0.98); }
        .side-item:hover  { background:#2A2D2E !important; }
        .hist-row:hover   { background:#2D2D2D !important; }
        .close-btn        { opacity:0; transition:opacity 0.1s; }
        .tab-item:hover .close-btn { opacity:1; }
        .tab-item.active  .close-btn { opacity:1; }
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:VS.editorBg, fontFamily:FONT_UI, color:VS.text, overflow:"hidden" }}>

        {/* ══ Title bar ═══════════════════════════════════════════════════ */}
        <div style={{
          height:30, flexShrink:0, background:VS.titleBar,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 12px", borderBottom:`1px solid ${VS.border}`, WebkitAppRegion:"drag",
          userSelect:"none",
        }}>
          {/* macOS-style traffic lights */}
          <div style={{ display:"flex", gap:6, alignItems:"center", WebkitAppRegion:"no-drag" }}>
            {["#FF5F57","#FFBD2E","#28C840"].map((c,i) => (
              <div key={i} style={{ width:12, height:12, borderRadius:"50%", background:c, flexShrink:0 }}/>
            ))}
          </div>
          {/* Title */}
          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:VS.textMuted }}>
            <Zap size={13} color={VS.accent}/>
            <span style={{ color:VS.text, fontWeight:500 }}>Firebox AI Studio</span>
            {activeFile && (
              <>
                <span style={{ color:VS.textFaint }}>—</span>
                <span>{activeFile.path.split("/").pop()}</span>
              </>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, WebkitAppRegion:"no-drag" }}>
            {phase !== "idle" && (
              <button onClick={reset} style={{
                display:"flex", alignItems:"center", gap:5, padding:"2px 8px",
                background:"transparent", border:`1px solid ${VS.border}`,
                color:VS.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
              }}>
                <RotateCcw size={11}/> New
              </button>
            )}
            <button onClick={() => setHistoryOpen(p=>!p)} style={{
              display:"flex", alignItems:"center", gap:5, padding:"2px 8px",
              background: historyOpen ? "#3D3D3D" : "transparent",
              border:`1px solid ${VS.border}`,
              color:VS.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
            }}>
              <History size={11}/> History
            </button>
          </div>
        </div>

        {/* History dropdown */}
        {historyOpen && (
          <div style={{ background:"#252526", borderBottom:`1px solid ${VS.border}`, padding:"10px 14px", animation:"fadeIn 0.15s", zIndex:50 }}>
            <div style={{ fontSize:10, color:VS.textMuted, marginBottom:6, fontWeight:700, letterSpacing:"0.1em" }}>RECENT BUILDS</div>
            {recentBuilds.length === 0
              ? <div style={{ fontSize:12, color:VS.textFaint }}>No builds yet.</div>
              : recentBuilds.map(b => (
                <div key={b._id} className="hist-row" style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"5px 8px", borderRadius:4, animation:"fadeIn 0.15s", cursor:"default",
                }}>
                  <span style={{ fontSize:12, color:VS.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.description}</span>
                  <span style={{ fontSize:11, color: b.status==="complete"?VS.success:b.status==="failed"?VS.error:VS.textMuted, marginLeft:10, flexShrink:0 }}>{b.status}</span>
                  <span style={{ fontSize:11, color:VS.textFaint, marginLeft:10, flexShrink:0 }}>{new Date(b.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* ══ Main area (activity bar + side panel + editor) ══════════════ */}
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

          {/* ── Activity bar ──────────────────────────────────────────── */}
          <div style={{
            width:48, flexShrink:0, background:VS.activityBar,
            borderRight:`1px solid ${VS.border}`,
            display:"flex", flexDirection:"column", alignItems:"center",
            paddingTop:8, gap:0,
          }}>
            {[
              { id:"explorer", Icon:Files,     title:"Explorer",    badge: allFiles.length || null },
              { id:"agents",   Icon:Cpu,       title:"AI Agents",   badge: activeAgent ? "●" : null, badgeColor:"#DCDCAA" },
              { id:"search",   Icon:Search,    title:"Search"  },
              { id:"git",      Icon:GitBranch, title:"Source Control" },
            ].map(({ id, Icon, title, badge, badgeColor }) => (
              <button
                key={id}
                className="act-btn"
                title={title}
                onClick={() => { setActivity(id); setSideOpen(p => activity===id ? !p : true); }}
                style={{
                  position:"relative", display:"flex", alignItems:"center", justifyContent:"center",
                  width:48, height:48, background:"transparent", border:"none",
                  borderLeft:`2px solid ${activity===id && sideOpen ? VS.accent : "transparent"}`,
                  color: activity===id && sideOpen ? VS.textActive : VS.textMuted,
                  cursor:"pointer", transition:"color 0.15s",
                }}
              >
                <Icon size={22}/>
                {badge && (
                  <span style={{
                    position:"absolute", top:6, right:6, minWidth:14, height:14, borderRadius:7,
                    background: badgeColor || VS.accent, color:"#fff",
                    fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                    padding:"0 3px",
                  }}>{typeof badge==="number" ? badge : null}</span>
                )}
              </button>
            ))}
            {/* Spacer + settings */}
            <div style={{ flex:1 }}/>
            <button className="act-btn" title="Settings" style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:48, height:48, background:"transparent", border:"none",
              borderLeft:"2px solid transparent", color:VS.textMuted, cursor:"pointer", marginBottom:4,
            }}>
              <Settings size={22}/>
            </button>
          </div>

          {/* ── Side panel ────────────────────────────────────────────── */}
          {sideOpen && (
            <div style={{
              width:260, flexShrink:0, background:VS.sideBar,
              borderRight:`1px solid ${VS.border}`,
              display:"flex", flexDirection:"column", overflow:"hidden",
            }}>

              {/* Panel: Explorer */}
              {activity === "explorer" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    EXPLORER
                  </div>
                  <div style={{ flex:1, overflowY:"auto" }}>
                    {allFiles.length === 0 ? (
                      <div style={{ padding:"20px 16px", fontSize:12, color:VS.textFaint, lineHeight:1.6 }}>
                        Files will appear here as agents complete their work.
                      </div>
                    ) : (
                      <>
                        {/* Project root */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", fontSize:12, color:VS.text, fontWeight:600 }}>
                          <ChevronDown size={13} color={VS.textMuted}/>
                          <Zap size={13} color={VS.accent}/>
                          <span>firebox-project</span>
                        </div>
                        {/* Per-agent groups */}
                        {AGENT_META.map(({ name: agentName, Icon, color }) => {
                          const agentFiles = filesByAgent[agentName] || [];
                          if (!agentFiles.length) return null;
                          const groupKey = `agent:${agentName}`;
                          const isOpen   = expandedDirs.has(groupKey);
                          const tree     = buildTree(agentFiles);
                          return (
                            <React.Fragment key={agentName}>
                              <div
                                onClick={() => toggleDir(groupKey)}
                                className="tree-item"
                                style={{ display:"flex", alignItems:"center", gap:6, paddingLeft:14, height:24, cursor:"pointer", userSelect:"none" }}
                              >
                                {isOpen ? <ChevronDown size={12} color={VS.textMuted}/> : <ChevronRight size={12} color={VS.textMuted}/>}
                                <Icon size={13} color={color}/>
                                <span style={{ fontSize:12, color:VS.textMuted, fontWeight:500 }}>{agentName}</span>
                                <span style={{ fontSize:11, color:VS.textFaint, marginLeft:"auto", paddingRight:8 }}>{agentFiles.length}</span>
                              </div>
                              {isOpen && (
                                <TreeNode
                                  name={agentName} node={tree} depth={2}
                                  onOpenFile={openFile} activeFilePath={activeTabPath}
                                  expandedDirs={expandedDirs} toggleDir={toggleDir}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Panel: Agent pipeline */}
              {activity === "agents" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    AGENT PIPELINE
                  </div>
                  <div style={{ flex:1, overflowY:"auto" }}>
                    {/* Prompt input */}
                    <div style={{ padding:"8px 10px 0" }}>
                      {phase === "idle" ? (
                        <>
                          <div style={{ fontSize:14, fontWeight:600, color:VS.textActive, marginBottom:4, lineHeight:1.4 }}>
                            Describe your app
                          </div>
                          <div style={{ fontSize:12, color:VS.textMuted, marginBottom:10, lineHeight:1.6 }}>
                            7 AI agents will generate every file — live.
                          </div>
                          <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            onKeyDown={e => { if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) startBuild(); }}
                            placeholder="e.g. A task management app with real-time collaboration, user auth, and analytics…"
                            rows={5}
                            style={{
                              width:"100%", background:"#3C3C3C", border:`1px solid ${VS.border}`,
                              borderRadius:4, padding:"8px 10px", color:VS.text,
                              fontSize:12, fontFamily:FONT_MONO, resize:"none", outline:"none",
                              lineHeight:1.6, transition:"border-color 0.2s",
                            }}
                            onFocus={e => (e.target.style.borderColor = VS.accent)}
                            onBlur={e  => (e.target.style.borderColor = VS.border)}
                          />
                          <button
                            onClick={startBuild}
                            disabled={!description.trim()}
                            className="build-btn"
                            style={{
                              display:"flex", alignItems:"center", justifyContent:"center", gap:7,
                              width:"100%", marginTop:8, padding:"8px",
                              borderRadius:4, border:"none",
                              background: description.trim() ? VS.accent : "#3C3C3C",
                              color:"#fff", fontSize:12, fontFamily:FONT_UI, fontWeight:600,
                              cursor: description.trim() ? "pointer" : "not-allowed", transition:"all 0.2s",
                            }}
                          >
                            <Play size={12} fill="white"/> Build with AI
                          </button>
                          <div style={{ fontSize:11, color:VS.textFaint, textAlign:"center", marginTop:5 }}>Ctrl+Enter to start</div>
                        </>
                      ) : (
                        <div style={{ padding:"8px 10px", background:"#2D2D2D", borderRadius:4, border:`1px solid ${VS.border}`, marginBottom:4 }}>
                          <div style={{ fontSize:10, color:VS.textMuted, fontWeight:700, letterSpacing:"0.08em", marginBottom:3 }}>BUILDING</div>
                          <div style={{ fontSize:12, color:VS.text, fontFamily:FONT_MONO, lineHeight:1.5 }}>{description}</div>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    {phase !== "idle" && (
                      <div style={{ padding:"10px 10px 0" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:11, color:VS.textMuted }}>
                            {phase==="complete" ? "✓ Complete" : `${doneCount} / ${AGENT_META.length} agents`}
                          </span>
                          <span style={{ fontSize:11, color:VS.textMuted }}>{Math.round(progress)}%</span>
                        </div>
                        <div style={{ height:2, background:"#3C3C3C", borderRadius:1, overflow:"hidden" }}>
                          <div style={{
                            height:"100%", borderRadius:1, transition:"width 0.4s ease",
                            background: phase==="complete" ? VS.success : VS.accent,
                            width:`${progress}%`,
                          }}/>
                        </div>
                      </div>
                    )}

                    {/* Agent rows */}
                    <div style={{ padding:"8px 6px" }}>
                      {AGENT_META.map(({ name, Icon, color }) => {
                        const state    = agentStates.find(a => a.name===name);
                        const isActive = activeAgent === name;
                        const files    = filesByAgent[name] || [];
                        return (
                          <div key={name} style={{
                            display:"flex", alignItems:"center", gap:8, padding:"6px 8px",
                            borderRadius:4, marginBottom:2,
                            background: isActive ? "#2D2D2D" : "transparent",
                            borderLeft:`2px solid ${isActive ? color : "transparent"}`,
                            transition:"all 0.15s",
                          }}>
                            <div style={{
                              width:28, height:28, borderRadius:6, flexShrink:0,
                              background:`${color}15`,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              border:`1px solid ${color}25`,
                            }}>
                              {isActive
                                ? <Loader2 size={13} color={color} style={{ animation:"spin 1s linear infinite" }}/>
                                : <Icon size={13} color={state.status==="idle" ? VS.textFaint : color}/>
                              }
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <span style={{ fontSize:12, fontWeight:500, color: state.status==="idle" ? VS.textMuted : VS.text }}>
                                  {name}
                                </span>
                                <AgentBadge status={state.status}/>
                              </div>
                              <div style={{ fontSize:10, color:VS.textFaint, marginTop:1 }}>
                                {files.length > 0 ? `${files.length} file${files.length!==1?"s":""}` : isActive ? "generating…" : "—"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Live terminal */}
                    {activeAgent && (
                      <div style={{ margin:"0 6px 8px", borderRadius:4, overflow:"hidden", border:`1px solid ${VS.border}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#1A1A1A", borderBottom:`1px solid ${VS.border}` }}>
                          <Terminal size={11} color={VS.accent}/>
                          <span style={{ fontSize:11, color:VS.accent, fontFamily:FONT_MONO }}>{activeAgent}</span>
                        </div>
                        <div ref={terminalRef} style={{
                          height:110, overflowY:"auto", padding:"6px 10px",
                          background:"#0D0D0D", fontFamily:FONT_MONO, fontSize:11,
                          color:"#9CDCFE", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word",
                        }}>
                          {agentStates.find(a=>a.name===activeAgent)?.streaming||""}
                          <span style={{ animation:"pulse 0.7s ease-in-out infinite", color:VS.accent }}>█</span>
                        </div>
                      </div>
                    )}

                    {errorMsg && (
                      <div style={{ margin:"0 6px 8px", padding:"8px 10px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:7 }}>
                        <AlertTriangle size={12} color={VS.error} style={{ flexShrink:0, marginTop:1 }}/>
                        <span style={{ fontSize:11, color:VS.error, lineHeight:1.5 }}>{errorMsg}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Panel: Search (placeholder) */}
              {activity === "search" && (
                <div style={{ padding:"10px 12px" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", marginBottom:10 }}>SEARCH</div>
                  <input placeholder="Search" style={{
                    width:"100%", background:"#3C3C3C", border:`1px solid ${VS.border}`,
                    borderRadius:4, padding:"6px 10px", color:VS.text, fontSize:12, outline:"none",
                    fontFamily:FONT_UI,
                  }}/>
                  <div style={{ fontSize:12, color:VS.textFaint, marginTop:12 }}>Search across generated files.</div>
                </div>
              )}

              {/* Panel: Git (placeholder) */}
              {activity === "git" && (
                <div style={{ padding:"10px 12px" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", marginBottom:10 }}>SOURCE CONTROL</div>
                  <div style={{ fontSize:12, color:VS.textFaint }}>
                    {allFiles.length > 0 ? `${allFiles.length} generated files` : "No files yet."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Editor area ────────────────────────────────────────────── */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* Tab bar */}
            <div style={{
              height:35, flexShrink:0, background:VS.tabBar,
              borderBottom:`1px solid ${VS.border}`,
              display:"flex", alignItems:"stretch", overflowX:"auto",
              overflowY:"hidden",
            }}>
              {openTabs.map(tab => {
                const isActive = tab.path === activeTabPath;
                const { Icon: AgIcon, color: agColor } = AGENT_META.find(a=>a.name===tab.agent) || {};
                return (
                  <div
                    key={tab.path}
                    className={`tab-item${isActive?" active":""}`}
                    onClick={() => setActiveTabPath(tab.path)}
                    title={tab.path}
                    style={{
                      display:"flex", alignItems:"center", gap:6, padding:"0 10px",
                      minWidth:100, maxWidth:180, flexShrink:0,
                      background: isActive ? VS.activeTab : VS.inactiveTab,
                      borderRight:`1px solid ${VS.border}`,
                      borderTop:`1px solid ${isActive ? VS.accent : "transparent"}`,
                      cursor:"pointer", userSelect:"none", position:"relative",
                    }}
                  >
                    <FileIcon path={tab.path} size={13}/>
                    <span style={{
                      fontSize:12, color: isActive ? VS.textActive : VS.textMuted,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1,
                    }}>
                      {tab.path.split("/").pop()}
                    </span>
                    <button
                      className="close-btn"
                      onClick={e => closeTab(tab.path, e)}
                      style={{
                        display:"flex", alignItems:"center", justifyContent:"center",
                        width:16, height:16, borderRadius:3, background:"transparent",
                        border:"none", color:VS.textMuted, cursor:"pointer", flexShrink:0,
                        padding:0,
                      }}
                    ><X size={11}/></button>
                  </div>
                );
              })}
              {/* Add-tab spacer */}
              <div style={{ flex:1, background:VS.tabBar, borderBottom:`1px solid transparent` }}/>
            </div>

            {/* Breadcrumb bar */}
            {activeFile && (
              <div style={{
                height:24, flexShrink:0, background:"#1E1E1E",
                borderBottom:`1px solid ${VS.border}`,
                display:"flex", alignItems:"center", padding:"0 12px",
                overflowX:"auto",
              }}>
                {breadcrumbs.map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight size={11} color={VS.textFaint} style={{ margin:"0 3px", flexShrink:0 }}/>}
                    <span style={{ fontSize:12, color: i===breadcrumbs.length-1 ? VS.text : VS.textMuted, whiteSpace:"nowrap", flexShrink:0 }}>
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Monaco editor or empty state */}
            <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
              {activeFile ? (
                <MonacoEditor
                  key={activeFile.path}
                  height="100%"
                  language={getMonacoLang(activeFile.path, activeFile.language)}
                  value={activeContent}
                  beforeMount={defineFireboxTheme}
                  onMount={handleEditorMount}
                  onChange={handleEditorChange}
                  theme="firebox-dark"
                  options={{
                    minimap:              { enabled: true, scale: 1 },
                    lineNumbers:          "on",
                    folding:              true,
                    foldingHighlight:     true,
                    wordWrap:             "off",
                    fontSize:             13,
                    fontFamily:           FONT_MONO,
                    fontLigatures:        true,
                    lineHeight:           22,
                    renderLineHighlight:  "all",
                    scrollBeyondLastLine: false,
                    smoothScrolling:      true,
                    cursorBlinking:       "smooth",
                    cursorStyle:          "line",
                    automaticLayout:      true,
                    tabSize:              2,
                    insertSpaces:         true,
                    bracketPairColorization: { enabled: true },
                    guides:               { bracketPairs: "active", indentation: true },
                    scrollbar: {
                      vertical:              "visible",
                      horizontal:            "visible",
                      useShadows:            false,
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10,
                    },
                    padding:              { top: 10, bottom: 10 },
                    renderValidationDecorations: "off",
                    overviewRulerLanes:   3,
                    stickyScroll:         { enabled: true },
                  }}
                />
              ) : (
                /* Welcome screen */
                <div style={{
                  height:"100%", display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", gap:20,
                  background:VS.editorBg, padding:40, userSelect:"none",
                }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                    <div style={{
                      width:64, height:64, borderRadius:16, background:"#252526",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      border:`1px solid ${VS.border}`,
                    }}>
                      <Zap size={30} color={VS.accent}/>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:600, color:VS.textActive, marginBottom:6 }}>Firebox AI Studio</div>
                      <div style={{ fontSize:13, color:VS.textMuted, maxWidth:380, lineHeight:1.7 }}>
                        {phase === "idle"
                          ? "Open the Agent Pipeline panel, describe your app, and click Build with AI."
                          : allFiles.length > 0
                            ? `${allFiles.length} files generated — select one from the Explorer to open it.`
                            : "Agents are working. Files will appear in the Explorer as they complete."}
                      </div>
                    </div>
                  </div>

                  {phase === "idle" && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxWidth:380, width:"100%" }}>
                      {[
                        { label:"Open Pipeline",  sub:"Start building with AI",     action:()=>{ setActivity("agents"); setSideOpen(true); } },
                        { label:"View Explorer",  sub:"Browse generated files",      action:()=>{ setActivity("explorer"); setSideOpen(true); } },
                        { label:"Recent Builds",  sub:"See past AI projects",        action:()=>setHistoryOpen(true) },
                        { label:"Toggle Sidebar", sub:"More / less screen space",    action:()=>setSideOpen(p=>!p) },
                      ].map(({ label, sub, action }) => (
                        <button key={label} onClick={action} style={{
                          padding:"10px 12px", background:"#252526",
                          border:`1px solid ${VS.border}`, borderRadius:6,
                          color:VS.text, textAlign:"left", cursor:"pointer",
                          transition:"border-color 0.15s, background 0.15s",
                        }}
                          onMouseEnter={e=>{ e.currentTarget.style.borderColor=VS.accent; e.currentTarget.style.background="#2A2D2E"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.borderColor=VS.border; e.currentTarget.style.background="#252526"; }}
                        >
                          <div style={{ fontSize:12, fontWeight:600, color:VS.textActive, marginBottom:2 }}>{label}</div>
                          <div style={{ fontSize:11, color:VS.textMuted }}>{sub}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {phase !== "idle" && (
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                      {phase === "building" && <Loader2 size={24} color={VS.accent} style={{ animation:"spin 1s linear infinite" }}/>}
                      {phase === "complete" && <CheckCircle2 size={24} color={VS.success}/>}
                      {allFiles.length > 0 && (
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center" }}>
                          {allFiles.slice(0,6).map(f => (
                            <button key={f.path} onClick={()=>openFile(f)} style={{
                              display:"flex", alignItems:"center", gap:5, padding:"4px 10px",
                              background:"#252526", border:`1px solid ${VS.border}`,
                              borderRadius:4, color:VS.textMuted, fontSize:11,
                              cursor:"pointer", fontFamily:FONT_MONO,
                            }}>
                              <FileIcon path={f.path} size={11}/>
                              {f.path.split("/").pop()}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ Status bar ══════════════════════════════════════════════════ */}
        <div style={{
          height:22, flexShrink:0, background: phase==="error" ? "#5A1D1D" : VS.statusBar,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 10px", fontSize:11, color:"#fff", userSelect:"none",
          transition:"background 0.3s",
        }}>
          {/* Left */}
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <GitBranch size={12}/>
              <span>main</span>
            </div>
            {phase === "building" && (
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/>
                <span>{activeAgent ? `${activeAgent} generating…` : "Starting pipeline…"}</span>
              </div>
            )}
            {phase === "complete" && (
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <CheckCircle2 size={11}/>
                <span>{allFiles.length} files generated</span>
              </div>
            )}
            {phase === "error" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, color:"#F48771" }}>
                <AlertTriangle size={11}/>
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
          {/* Right */}
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            {activeFile && (
              <>
                <span>Ln {lineCol.line}, Col {lineCol.col}</span>
                <span>Spaces: 2</span>
                <span>UTF-8</span>
                <span style={{ textTransform:"capitalize" }}>
                  {getMonacoLang(activeFile.path, activeFile.language)}
                </span>
              </>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <Zap size={11}/>
              <span>Firebox AI</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Cpu({ size, color, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color||"currentColor"} strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" style={style}>
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/>
      <line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/>
      <line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/>
      <line x1="20" y1="14" x2="23" y2="14"/>
      <line x1="1" y1="9" x2="4" y2="9"/>
      <line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  );
}
