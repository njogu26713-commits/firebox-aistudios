import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import MonacoEditor from "@monaco-editor/react";
import JSZip from "jszip";
import {
  Brain, Server, Palette, Database, ShieldCheck, FlaskConical, Rocket,
  CheckCircle2, AlertTriangle, Loader2, Play, Sparkles, Terminal,
  Copy, Check, ChevronRight, ChevronDown, RotateCcw, X, Search,
  GitBranch, Settings, Files, FileText, FileCode, FileJson,
  FolderOpen, Folder, History, Home, Zap, Code2, Package,
  Upload, Link, Key, Send, GitCommit, RefreshCw, ExternalLink,
  Eye, EyeOff, Globe, Plus, Github, Trash2, PanelLeftClose, PanelLeftOpen, Workflow,
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

function getLocalAiUrls(endpoint) {
  const normalized = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("Local AI endpoint is required");

  const baseUrl = normalized.endsWith("/models")
    ? normalized.slice(0, -"/models".length)
    : normalized.endsWith("/chat/completions")
      ? normalized.slice(0, -"/chat/completions".length)
      : normalized;

  return {
    modelsUrl: `${baseUrl}/models`,
    chatUrl: `${baseUrl}/chat/completions`,
  };
}

function logLocalAiDebug(...args) {
  if (import.meta.env.DEV) console.debug("[Local AI]", ...args);
}

function readLocalAiText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(part => {
      if (typeof part === "string") return part;
      return part?.text || part?.content || "";
    }).join("").trim();
  }
  return "";
}

function extractLocalAiReply(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  return {
    content: readLocalAiText(message.content) || readLocalAiText(choice.text),
    reasoning: readLocalAiText(message.reasoning_content) || readLocalAiText(message.reasoning),
  };
}

function cleanLocalAiChatReply(text) {
  const source = String(text || "").trim();
  const actionPattern = /\[?\s*ACTION\s*:\s*(build|edit)\s*\]?/gi;
  const actionMatches = [...source.matchAll(actionPattern)];
  const action = actionMatches[0]?.[1]?.toLowerCase() || null;
  const cleaned = source
    .replace(actionPattern, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, action };
}

async function fetchLocalAi(url, options = {}) {
  return fetch(url, options);
}

async function requestLocalChat({ config, messages, hasFiles, fileNames, engine }) {
  const engineBase = String(engine?.url || "").trim().replace(/\/+$/, "");
  const viaEngine = Boolean(engineBase && String(engine?.token || "").trim());
  const { chatUrl: directChatUrl } = getLocalAiUrls(config.endpoint);
  const chatUrl = viaEngine ? `${engineBase}/api/chat` : directChatUrl;
  const headers = { "Content-Type": "application/json" };
  if (viaEngine) headers.Authorization = `Bearer ${String(engine.token).trim()}`;
  else if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const fileContext = hasFiles && fileNames.length
    ? `\nThe user currently has a project open with these files: ${fileNames.slice(0, 20).join(", ")}.`
    : "\nThe user has no project files open yet.";
  const systemPrompt =
    "You are an AI coding assistant inside Firebox AI Studio. Return only the final answer, never hidden reasoning or analysis. Answer naturally and take actions only on explicit commands." +
    fileContext +
    "\n\nFor explicit build requests, produce a professional production-quality result: use a coherent architecture, polished responsive UI, accessible semantic markup, strong visual hierarchy, complete user flows, loading/empty/error states, validated inputs, secure handling of secrets, maintainable components, realistic content, and no placeholders or TODOs. Implement the requested functionality end-to-end and ensure the generated app is testable, buildable, and ready to run.\n\nOnly append one [ACTION:build] tag for an explicit request to build/create a project, or one [ACTION:edit] tag for an explicit request to change/fix/add existing files. Never repeat action tags. Never add an action tag for questions or brainstorming. Put the single action tag on the final line. Do not output internal reasoning.";

  const buildMessages = retry => [
    { role: "system", content: retry
      ? `${systemPrompt}\n\nThis is a retry. Return one concise final answer immediately. Do not think aloud. Do not return reasoning_content.`
      : systemPrompt },
    ...messages.map((message, index) => ({
      role: message.role === "ai" ? "assistant" : "user",
      content: index === messages.length - 1 && message.role === "user"
        ? `${message.text}\n/no_think`
        : message.text,
    })),
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    logLocalAiDebug("POST", chatUrl, "model", config.model, viaEngine ? "local engine chat" : "direct browser chat", { attempt: attempt + 1 });
    const response = await fetchLocalAi(chatUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        endpoint: config.endpoint,
        model: config.model,
        apiKey: config.apiKey,
        messages: buildMessages(attempt === 1),
        think: false,
        stream: false,
        max_tokens: 256,
        temperature: 0.5,
      }),
    });
    logLocalAiDebug("POST", chatUrl, "HTTP", response.status, "direct browser chat", { attempt: attempt + 1 });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`POST ${chatUrl} failed with HTTP ${response.status}`);

    const content = viaEngine ? readLocalAiText(data.text) : extractLocalAiReply(data).content;
    if (content) return cleanLocalAiChatReply(content);
    logLocalAiDebug("No final content returned; retrying without visible reasoning", { attempt: attempt + 1 });
  }

  throw new Error("Local AI returned no final assistant content after retry");
}

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

const AI_PROVIDER_CARDS = [
  { id:"cloud", Icon:Zap, title:"Cloud AI / Groq", subtitle:"Current default", description:"Fast, optimized AI for building and coding with Firebox.", color:"#38BDF8", action:"Select", enabled:true },
  { id:"local", Icon:Server, title:"Local AI / Ollama", subtitle:"Your local model", description:"Use any Ollama or OpenAI-compatible model through your local setup.", color:"#4EC994", action:"Configure", enabled:true },
  { id:"openai", Icon:Brain, title:"OpenAI", subtitle:"GPT models", description:"Powerful general-purpose models for coding, reasoning, and creativity.", color:"#4EC994", action:"Coming soon", enabled:false },
  { id:"anthropic", Icon:Sparkles, title:"Anthropic", subtitle:"Claude models", description:"Advanced reasoning, large context understanding, and safe-by-design models.", color:"#F3A65B", action:"Coming soon", enabled:false },
  { id:"google", Icon:Globe, title:"Google", subtitle:"Gemini models", description:"Multimodal capabilities with long context and strong performance.", color:"#60A5FA", action:"Coming soon", enabled:false },
  { id:"openrouter", Icon:GitBranch, title:"OpenRouter", subtitle:"Multiple providers", description:"Access multiple model providers through one unified interface.", color:"#A78BFA", action:"Coming soon", enabled:false },
  { id:"custom", Icon:Settings, title:"Custom OpenAI-compatible", subtitle:"Your endpoint", description:"Use your own compatible provider endpoint and API key.", color:"#94A3B8", action:"Configure", enabled:false },
];

/* ─── Agent sub-steps (shown as collapsible actions) ─────────────────────── */
const AGENT_STEPS = {
  Architect:  [
    { icon:"🔍", text:"Analyzing requirements…"         },
    { icon:"🧠", text:"Designing system architecture…"  },
    { icon:"⚙️", text:"Selecting technology stack…"    },
    { icon:"📖", text:"Defining API surface & data flow…"},
    { icon:"💻", text:"Writing ARCHITECTURE.md…"        },
    { icon:"💻", text:"Writing package.json…"           },
    { icon:"💻", text:"Writing .env.example…"           },
  ],
  Backend:    [
    { icon:"🧠", text:"Planning API structure…"          },
    { icon:"⚙️", text:"Generating Express server…"      },
    { icon:"💻", text:"Writing route handlers…"          },
    { icon:"🔐", text:"Adding auth middleware…"          },
    { icon:"💻", text:"Writing error handler…"           },
    { icon:"✅", text:"Validating endpoint coverage…"   },
  ],
  Frontend:   [
    { icon:"🧠", text:"Planning component tree…"         },
    { icon:"🎨", text:"Designing UI layout…"             },
    { icon:"💻", text:"Creating App.jsx…"                },
    { icon:"💻", text:"Building page components…"        },
    { icon:"🔗", text:"Connecting to backend API…"       },
    { icon:"💻", text:"Writing global styles…"           },
  ],
  Database:   [
    { icon:"🧠", text:"Analysing data model…"            },
    { icon:"🗄️", text:"Designing MongoDB schemas…"      },
    { icon:"💻", text:"Writing Mongoose models…"         },
    { icon:"⚙️", text:"Creating compound indexes…"      },
    { icon:"💻", text:"Writing seed data script…"        },
  ],
  Security:   [
    { icon:"🔍", text:"Scanning generated code…"         },
    { icon:"🛡️", text:"Configuring rate limiting…"      },
    { icon:"💻", text:"Writing validation middleware…"   },
    { icon:"🔐", text:"Implementing JWT utilities…"      },
    { icon:"📖", text:"Writing SECURITY.md report…"      },
  ],
  QA:         [
    { icon:"🧠", text:"Planning test strategy…"           },
    { icon:"⚙️", text:"Setting up test environment…"    },
    { icon:"💻", text:"Writing integration tests…"       },
    { icon:"💻", text:"Writing auth flow tests…"         },
    { icon:"✅", text:"Running edge case coverage…"      },
  ],
  Deployment: [
    { icon:"🐳", text:"Writing Dockerfile…"              },
    { icon:"⚙️", text:"Creating docker-compose.yml…"    },
    { icon:"🔗", text:"Configuring CI/CD pipeline…"     },
    { icon:"💻", text:"Writing nginx config…"            },
    { icon:"📖", text:"Writing DEPLOYMENT.md…"           },
    { icon:"🚀", text:"Finalising production build…"    },
  ],
};

/* ─── Prompt suggestions shown on the idle screen ───────────────────────── */
const PROMPT_SUGGESTIONS = [
  {
    icon: "🛒",
    label: "E-commerce store",
    prompt: "Build a full-stack e-commerce store with product listings, shopping cart, user auth, and Stripe checkout integration",
  },
  {
    icon: "💬",
    label: "Real-time chat app",
    prompt: "Build a real-time chat application with WebSocket support, multiple rooms, user presence indicators, and message history",
  },
  {
    icon: "📋",
    label: "Project management",
    prompt: "Build a project management app with Kanban boards, task assignment, due dates, comments, and team collaboration features",
  },
  {
    icon: "📊",
    label: "Analytics dashboard",
    prompt: "Build an analytics dashboard with interactive charts, KPI cards, date range filters, CSV export, and a REST API backend",
  },
  {
    icon: "🤖",
    label: "AI chatbot",
    prompt: "Build an AI-powered chatbot app with streaming responses, conversation history, system prompt configuration, and a clean chat UI",
  },
  {
    icon: "🔐",
    label: "SaaS starter",
    prompt: "Build a SaaS starter app with user authentication, subscription billing via Stripe, a settings page, and a protected dashboard",
  },
  {
    icon: "📝",
    label: "Blog platform",
    prompt: "Build a full-stack blog platform with a markdown editor, post categories, comments, user auth, and SEO-friendly URLs",
  },
  {
    icon: "🗓️",
    label: "Booking system",
    prompt: "Build a booking and scheduling app with calendar availability, appointment creation, email notifications, and an admin panel",
  },
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

/* ─── Thinking dots animation ────────────────────────────────────────────── */
function ThinkingDots() {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, color:"#8B8B8B", fontSize:11 }}>
      Thinking
      {[0,1,2].map(i => (
        <span key={i} style={{
          width:3, height:3, borderRadius:"50%", background:"#8B8B8B",
          display:"inline-block",
          animation:`dotBounce 1.4s ease-in-out ${i*0.2}s infinite`,
        }}/>
      ))}
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
  const [phase,          setPhase]          = useState("idle");
  const [description,    setDescription]    = useState("");
  const [agentStates,    setAgentStates]    = useState(
    AGENT_META.map((a) => ({ name:a.name, status:"idle", streaming:"" }))
  );
  const [activeAgent,    setActiveAgent]    = useState(null);
  const [workflowStage,  setWorkflowStage]  = useState(null);
  const [allFiles,       setAllFiles]       = useState([]);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [recentBuilds,   setRecentBuilds]   = useState([]);
  const [currentBuildId, setCurrentBuildId] = useState(null);
  const [buildPlan, setBuildPlan] = useState(null);
  const [planning, setPlanning] = useState(false);

  /* edit state */
  const [editingFiles,     setEditingFiles]     = useState(false);
  const [editStream,       setEditStream]       = useState("");
  const [editChangedFiles, setEditChangedFiles] = useState([]); // [{path, applied, failed, isNew}]
  const [editError,        setEditError]        = useState("");

  /* chat state */
  const [chatHistory,    setChatHistory]    = useState([]);  // [{role:"user"|"ai", text:string}]
  const [chatInput,      setChatInput]      = useState("");
  const [aiThinking,     setAiThinking]     = useState(false);  // waiting for /api/chat response
  const [aiStreamText,   setAiStreamText]   = useState("");     // partial AI reply text

  /* editor state */
  const [openTabs,       setOpenTabs]       = useState([]);          // [{path,agent,content,language}]
  const [activeTabPath,  setActiveTabPath]  = useState(null);
  const [expandedDirs,   setExpandedDirs]   = useState(new Set());
  const [tabContents,    setTabContents]    = useState({});          // {path: currentContent}

  /* agent timing + step state */
  const [agentStartTimes, setAgentStartTimes] = useState({});  // { name: timestamp }
  const [agentElapsed,    setAgentElapsed]    = useState({});  // { name: seconds }
  const [agentVisSteps,   setAgentVisSteps]   = useState({});  // { name: visibleCount }
  const [stepsCollapsed,  setStepsCollapsed]  = useState({});  // { name: bool } true=collapsed

  /* new-project dropdown */
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [importing,   setImporting]   = useState(false);
  const newProjRef = useRef(null);

  /* layout state */
  const [activity,    setActivity]    = useState("workspace");        // "home"|"workspace"|"explorer"|"agents"|"search"|"git"|"projects"
  const [sideOpen,    setSideOpen]    = useState(false);
  const [navExpanded, setNavExpanded] = useState(() => {
    try { return localStorage.getItem("firebox-nav-expanded") !== "false"; } catch { return true; }
  });
  const [lineCol,     setLineCol]     = useState({ line:1, col:1 });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  /* AI provider settings — Cloud remains the default and unchanged */
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("firebox-ai-provider") || "cloud");
  const [localAiEndpoint, setLocalAiEndpoint] = useState(() => localStorage.getItem("firebox-local-ai-endpoint") || "http://127.0.0.1:11434/v1");
  const [localAiModel, setLocalAiModel] = useState(() => localStorage.getItem("firebox-local-ai-model") || "");
  const [localAiApiKey, setLocalAiApiKey] = useState(() => localStorage.getItem("firebox-local-ai-api-key") || "");
  const [localEngineUrl, setLocalEngineUrl] = useState(() => localStorage.getItem("firebox-local-engine-url") || "http://127.0.0.1:8787");
  const [localEngineToken, setLocalEngineToken] = useState(() => localStorage.getItem("firebox-local-engine-token") || "");
  const [localAiTestState, setLocalAiTestState] = useState("idle");
  const [localAiTestMessage, setLocalAiTestMessage] = useState("");

  useEffect(() => {
    localStorage.setItem("firebox-ai-provider", aiProvider);
    localStorage.setItem("firebox-local-ai-endpoint", localAiEndpoint);
    localStorage.setItem("firebox-local-ai-model", localAiModel);
    localStorage.setItem("firebox-local-ai-api-key", localAiApiKey);
    localStorage.setItem("firebox-local-engine-url", localEngineUrl);
    localStorage.setItem("firebox-local-engine-token", localEngineToken);
  }, [aiProvider, localAiEndpoint, localAiModel, localAiApiKey, localEngineUrl, localEngineToken]);

  const localAiConfig = useMemo(() => ({
    endpoint: localAiEndpoint.trim(),
    model: localAiModel.trim(),
    apiKey: localAiApiKey.trim(),
  }), [localAiEndpoint, localAiModel, localAiApiKey]);

  /* projects panel state */
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [projectFilesMap,  setProjectFilesMap]  = useState({});   // { buildId: files[] }
  const [loadingProjectId, setLoadingProjectId] = useState(null);

  /* git panel state */
  const [gitRepoUrl,    setGitRepoUrl]    = useState("");
  const [gitToken,      setGitToken]      = useState("");
  const [gitTokenInput, setGitTokenInput] = useState("");
  const [gitRepo,       setGitRepo]       = useState(null);   // { owner, repo, branch, files, fullName, htmlUrl }
  const [gitConnecting, setGitConnecting] = useState(false);
  const [gitError,      setGitError]      = useState("");
  const [gitFileShas,   setGitFileShas]   = useState({});     // { path: sha }
  const [gitLoadingFile,setGitLoadingFile]= useState(null);
  const [gitExpandedDirs,setGitExpandedDirs] = useState(new Set());
  const [gitAiOpen,     setGitAiOpen]     = useState(false);
  const [gitInstruction,setGitInstruction]= useState("");
  const [gitAiEditing,  setGitAiEditing]  = useState(false);
  const [gitPushing,    setGitPushing]    = useState(false);
  const [gitPushMsg,    setGitPushMsg]    = useState("");
  const [gitPushResult, setGitPushResult] = useState(null);  // { commitUrl } | { error }

  /* git — saved token + repo list */
  const [gitTokenSaved,    setGitTokenSaved]    = useState(false);   // token exists in DB
  const [gitTokenSaving,   setGitTokenSaving]   = useState(false);
  const [gitRepos,         setGitRepos]         = useState([]);
  const [gitReposLoading,  setGitReposLoading]  = useState(false);
  const [gitRepoFilter,    setGitRepoFilter]    = useState("");
  const [gitChangePrompt,  setGitChangePrompt]  = useState("");      // "what changes?" after repo select
  const [gitShowPromptStep,setGitShowPromptStep]= useState(false);   // show prompt step
  const [gitAnalyzing,     setGitAnalyzing]     = useState(false);   // analyzing repo with agents
  const [gitImporting,     setGitImporting]     = useState(false);   // importing repo as project

  const terminalRef    = useRef(null);
  const chatInputRef   = useRef(null);
  const esRef          = useRef(null);
  const streamingRef   = useRef({});
  const editorRef      = useRef(null);
  const agentTimerRefs = useRef({});  // { name: { elapsed: intervalId, steps: timeoutIds[] } }

  /* mobile breakpoint */
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  /* scroll terminal to bottom */
  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [agentStates]);

  useEffect(() => {
    fetch("/api/builds").then(r => r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(()=>{});
  }, []);

  /* close new-project dropdown on outside click */
  useEffect(() => {
    if (!newProjOpen) return;
    const handler = (e) => {
      if (newProjRef.current && !newProjRef.current.contains(e.target))
        setNewProjOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [newProjOpen]);

  const updateAgent = useCallback((name, patch) =>
    setAgentStates(prev => prev.map(a => a.name===name ? {...a,...patch} : a)), []);

  /* ── Import: local folder ─────────────────────────────────────────────── */
  const importFolder = useCallback(async () => {
    setNewProjOpen(false);
    if (!window.showDirectoryPicker) {
      alert("Folder import requires Chrome or Edge. Try uploading a ZIP instead.");
      return;
    }
    let dirHandle;
    try { dirHandle = await window.showDirectoryPicker(); }
    catch (err) { if (err.name !== "AbortError") console.error(err); return; }

    setImporting(true);
    const files = [];

    async function readDir(handle, prefix) {
      for await (const [name, entry] of handle.entries()) {
        if (name.startsWith(".") || name === "node_modules") continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === "file") {
          try {
            const f = await entry.getFile();
            const content = await f.text();
            files.push({ path, content, agent: "Import", language: "" });
          } catch {}
        } else {
          await readDir(entry, path);
        }
      }
    }

    await readDir(dirHandle, dirHandle.name);
    setAllFiles(files);
    setOpenTabs([]); setActiveTabPath(null); setTabContents({});
    if (files.length > 0) {
      const f = files[0];
      setOpenTabs([f]); setActiveTabPath(f.path);
      setTabContents({ [f.path]: f.content });
    }
    setCurrentBuildId(null); // local import — no server build to edit against
    setActivity("explorer"); setImporting(false);
  }, []);

  /* ── Import: ZIP file ─────────────────────────────────────────────────── */
  const importZip = useCallback(() => {
    setNewProjOpen(false);
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".zip";
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      setImporting(true);
      try {
        const zip = await JSZip.loadAsync(input.files[0]);
        const files = [];
        for (const [path, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          const seg = path.split("/");
          if (seg.some(s => s.startsWith(".") || s === "node_modules")) continue;
          try {
            const content = await entry.async("string");
            files.push({ path, content, agent: "Import", language: "" });
          } catch {}
        }
        setAllFiles(files);
        setOpenTabs([]); setActiveTabPath(null); setTabContents({});
        if (files.length > 0) {
          const f = files[0];
          setOpenTabs([f]); setActiveTabPath(f.path);
          setTabContents({ [f.path]: f.content });
        }
        setCurrentBuildId(null); // local import — no server build to edit against
        setActivity("explorer");
      } catch (err) { console.error(err); }
      setImporting(false);
    };
    input.click();
  }, []);

  /* ── Import: GitHub (open git panel) ─────────────────────────────────── */
  const importGithub = useCallback(() => {
    setNewProjOpen(false);
    setActivity("git");
    setSideOpen(true);
  }, []);

  const testLocalAi = useCallback(async () => {
    setLocalAiTestState("testing");
    setLocalAiTestMessage("");
    let modelsUrl = "";
    let chatUrl = "";
    const engineBase = localEngineUrl.trim().replace(/\/+$/, "");

    try {
      if (engineBase && localEngineToken.trim()) {
        const engineUrl = `${engineBase}/api/test-ollama`;
        const engineResponse = await fetch(engineUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localEngineToken.trim()}` },
          body: JSON.stringify(localAiConfig),
        });
        const engineData = await engineResponse.json().catch(() => ({}));
        if (!engineResponse.ok || !engineData.ok) {
          const cause = engineData.cause ? ` (${engineData.cause})` : "";
          throw new Error(`${engineData.error || `Local Engine returned HTTP ${engineResponse.status}`}${cause}`);
        }
        const suffix = engineData.selectedModelAvailable === false ? ` Model was not listed by Ollama.` : "";
        setLocalAiTestState("success");
        setLocalAiTestMessage(`Connection works through Local Engine. ${engineData.models?.length || 0} model(s) available.${suffix}`);
        return;
      }
      const urls = getLocalAiUrls(localAiConfig.endpoint);
      modelsUrl = urls.modelsUrl;
      chatUrl = urls.chatUrl;
      const headers = {};
      if (localAiConfig.apiKey) headers.Authorization = `Bearer ${localAiConfig.apiKey}`;

      logLocalAiDebug("GET", modelsUrl);
      const modelsRes = await fetchLocalAi(modelsUrl, { headers });
      logLocalAiDebug("GET", modelsUrl, "HTTP", modelsRes.status);
      const modelsData = await modelsRes.json().catch(() => ({}));
      if (!modelsRes.ok) {
        throw new Error(`GET ${modelsUrl} failed with HTTP ${modelsRes.status}`);
      }

      const availableModels = Array.isArray(modelsData.data)
        ? modelsData.data.map(model => model.id).filter(Boolean)
        : [];
      if (availableModels.length && !availableModels.includes(localAiConfig.model)) {
        throw new Error(`Model "${localAiConfig.model}" was not returned by ${modelsUrl}. Available: ${availableModels.join(", ")}`);
      }

      logLocalAiDebug("POST", chatUrl, "model", localAiConfig.model);
      const chatRes = await fetchLocalAi(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          model: localAiConfig.model,
          messages: [{ role: "user", content: "Reply with exactly: Firebox Local AI connection OK" }],
          stream: false,
          max_tokens: 32,
          temperature: 0,
        }),
      });
      logLocalAiDebug("POST", chatUrl, "HTTP", chatRes.status);
      const chatData = await chatRes.json().catch(() => ({}));
      if (!chatRes.ok) {
        throw new Error(`POST ${chatUrl} failed with HTTP ${chatRes.status}`);
      }

      const { content, reasoning } = extractLocalAiReply(chatData);
      const reply = content || reasoning;
      logLocalAiDebug("response keys", Object.keys(chatData || {}), "choice keys", Object.keys(chatData.choices?.[0] || {}), "message keys", Object.keys(chatData.choices?.[0]?.message || {}));
      if (!reply) throw new Error("Local AI returned no assistant content or reasoning");

      setLocalAiTestState("success");
      setLocalAiTestMessage(`Connection works${content ? "" : " (reasoning response received)"}. ${reply}`);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[Local AI] request failed", { modelsUrl, chatUrl, error: err });
      setLocalAiTestState("error");
      setLocalAiTestMessage(err.message || "Local AI request failed");
    }
  }, [localAiConfig, localEngineUrl, localEngineToken]);

  const testLocalEngine = useCallback(async () => {
    setLocalAiTestState("testing");
    setLocalAiTestMessage("");
    const base = localEngineUrl.trim().replace(/\/+$/, "");
    try {
      if (!base || !localEngineToken.trim()) throw new Error("Enter the Local Engine URL and pairing token first");
      const response = await fetch(`${base}/health`, { headers: { Authorization: `Bearer ${localEngineToken.trim()}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Local Engine returned HTTP ${response.status}`);
      setLocalAiTestState("success");
      setLocalAiTestMessage(`Local Engine works. Workspace: ${data.workspace}`);
    } catch (error) {
      setLocalAiTestState("error");
      setLocalAiTestMessage(error.message || "Local Engine request failed");
    }
  }, [localEngineUrl, localEngineToken]);

  /* ── Start build ──────────────────────────────────────────────────────── */
  const startBuild = useCallback(async (desc) => {
    const buildDesc = (desc ?? description).trim();
    if (!buildDesc) return;
    setPhase("building");
    setErrorMsg("");
    streamingRef.current = {};
    setAgentStates(AGENT_META.map(a => ({ name:a.name, status:"idle", streaming:"" })));
    setAllFiles([]);
    setOpenTabs([]);
    setActiveTabPath(null);
    setTabContents({});
    setActiveAgent(null);
    setWorkflowStage(null);
    setActivity("workspace");
    setAgentStartTimes({});
    setAgentElapsed({});
    setAgentVisSteps({});
    setStepsCollapsed({});
    Object.values(agentTimerRefs.current).forEach(({ elapsed, steps }) => {
      clearInterval(elapsed); steps.forEach(clearTimeout);
    });
    agentTimerRefs.current = {};

    let buildId;
    const useLocalEngine = aiProvider === "local";
    const engineBase = localEngineUrl.trim().replace(/\/+$/, "");
    if (useLocalEngine && (!engineBase || !localEngineToken.trim())) {
      setPhase("error");
      setErrorMsg("Local AI builds require the Local Firebox Engine URL and pairing token. Start the engine on Windows and enter both values in Settings.");
      return;
    }
    try {
      const requestUrl = useLocalEngine ? `${engineBase}/api/build` : "/api/build";
      const headers = { "Content-Type": "application/json" };
      if (useLocalEngine) headers.Authorization = `Bearer ${localEngineToken.trim()}`;
      const res = await fetch(requestUrl, {
        method:"POST", headers,
        body: JSON.stringify(useLocalEngine ? {
          description: buildDesc,
          endpoint: localAiConfig.endpoint,
          model: localAiConfig.model,
          apiKey: localAiConfig.apiKey,
        } : {
          description: buildDesc,
          provider: aiProvider,
          localAi: aiProvider === "local" ? localAiConfig : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      buildId = useLocalEngine ? data.jobId : data.buildId;
      if (!useLocalEngine) setCurrentBuildId(data.buildId);
    } catch (err) { setPhase("error"); setErrorMsg(err.message); return; }

    const eventUrl = useLocalEngine
      ? `${engineBase}/api/build/${buildId}/events?token=${encodeURIComponent(localEngineToken.trim())}`
      : `/api/build/${buildId}/events`;
    const es = new EventSource(eventUrl);
    esRef.current = es;

    es.addEventListener("workflow-stage-start", e => {
      try { setWorkflowStage(JSON.parse(e.data)); } catch { /* ignore malformed activity event */ }
    });
    es.addEventListener("workflow-stage-complete", e => {
      try { setWorkflowStage(prev => ({ ...(prev || {}), ...JSON.parse(e.data), completed:true })); } catch { /* ignore malformed activity event */ }
    });
    es.addEventListener("workflow-stage-error", e => {
      try { setWorkflowStage(prev => ({ ...(prev || {}), ...JSON.parse(e.data), error:true })); } catch { /* ignore malformed activity event */ }
    });
    es.addEventListener("workflow-repair", e => {
      try {
        const repair = JSON.parse(e.data);
        setChatHistory(prev => [...prev, { role:"ai", text:`Build step failed. I’m investigating and retrying (${repair.attempt}/${repair.maxAttempts})…` }]);
      } catch { /* ignore malformed repair event */ }
    });
    es.addEventListener("project-inspected", e => {
      try {
        const project = JSON.parse(e.data);
        setChatHistory(prev => [...prev, { role:"ai", text:`I inspected the project before editing it${project.files?.length ? ` (${project.files.length} files found)` : ""}.` }]);
      } catch { /* ignore malformed inspection event */ }
    });

    es.addEventListener("agent-start", e => {
      const { agent } = JSON.parse(e.data);
      setActiveAgent(agent);
      updateAgent(agent, { status:"working", streaming:"" });
      streamingRef.current[agent] = "";

      // Start elapsed timer
      const startTime = Date.now();
      setAgentStartTimes(prev => ({ ...prev, [agent]: startTime }));
      setAgentElapsed(prev => ({ ...prev, [agent]: 0 }));
      setAgentVisSteps(prev => ({ ...prev, [agent]: 1 }));

      const elapsedId = setInterval(() => {
        setAgentElapsed(prev => ({ ...prev, [agent]: Math.round((Date.now() - startTime) / 1000) }));
      }, 1000);

      // Reveal sub-steps progressively over ~17 seconds
      const steps = AGENT_STEPS[agent] || [];
      const gap   = steps.length > 1 ? 17000 / (steps.length - 1) : 17000;
      const stepIds = steps.slice(1).map((_, i) =>
        setTimeout(() => {
          setAgentVisSteps(prev => ({ ...prev, [agent]: i + 2 }));
        }, gap * (i + 1))
      );

      agentTimerRefs.current[agent] = { elapsed: elapsedId, steps: stepIds };
    });

    es.addEventListener("agent-token", e => {
      const { agent, token } = JSON.parse(e.data);
      streamingRef.current[agent] = (streamingRef.current[agent]||"") + token;
      updateAgent(agent, { streaming: streamingRef.current[agent] });
    });

    es.addEventListener("agent-complete", e => {
      const { agent, files } = JSON.parse(e.data);
      // Stop timers and show all steps
      if (agentTimerRefs.current[agent]) {
        clearInterval(agentTimerRefs.current[agent].elapsed);
        agentTimerRefs.current[agent].steps.forEach(clearTimeout);
        delete agentTimerRefs.current[agent];
      }
      setAgentVisSteps(prev => ({ ...prev, [agent]: (AGENT_STEPS[agent]||[]).length }));
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
      if (agentTimerRefs.current[agent]) {
        clearInterval(agentTimerRefs.current[agent].elapsed);
        agentTimerRefs.current[agent].steps.forEach(clearTimeout);
        delete agentTimerRefs.current[agent];
      }
      setAgentVisSteps(prev => ({ ...prev, [agent]: (AGENT_STEPS[agent]||[]).length }));
      updateAgent(agent, { status:"error", streaming:"" });
      setErrorMsg(`${agent}: ${message}`);
    });

    es.addEventListener("build-complete", () => {
      setPhase("complete");
      setActiveAgent(null);
      setWorkflowStage({ stage:"preview", label:"Preview", activity:"Build complete — preview is ready", completed:true });
      setPreviewOpen(true);
      es.close();
      fetch("/api/builds").then(r=>r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(()=>{});
    });

    es.addEventListener("build-error", e => {
      const { message } = JSON.parse(e.data);
      setPhase("error"); setErrorMsg(message); es.close();
    });

    es.onerror = () => { setPhase("error"); setErrorMsg("Connection lost."); es.close(); };
  }, [updateAgent, aiProvider, localAiConfig, localEngineUrl, localEngineToken]);

  /* ── Edit existing build files with targeted search/replace ───────────── */
  const startEditFiles = useCallback(async (instruction) => {
    if (!currentBuildId || !instruction.trim()) return;
    setEditingFiles(true);
    setEditStream("");
    setEditChangedFiles([]);
    setEditError("");
    setActivity("workspace");
    setSideOpen(false);

    try {
      const res = await fetch("/api/edit-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildId: currentBuildId,
          instruction,
          provider: aiProvider,
          localAi: aiProvider === "local" ? localAiConfig : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();

        for (const part of parts) {
          // SSE lines start with "event: X\ndata: {...}" or just "data: {...}"
          const eventMatch = part.match(/^event:\s*(\S+)\ndata:\s*(.+)$/s);
          const dataMatch  = !eventMatch && part.match(/^data:\s*(.+)$/s);
          let   eventName  = eventMatch ? eventMatch[1] : null;
          let   rawData    = eventMatch ? eventMatch[2] : dataMatch ? dataMatch[1] : null;
          if (!rawData) continue;

          let evt;
          try { evt = JSON.parse(rawData); } catch { continue; }

          if (eventName === "edit-token" || evt.token) {
            setEditStream(prev => prev + (evt.token || ""));
          } else if (eventName === "edit-file-updated" || evt.path) {
            const { path: filePath, content: newContent, isNew, applied, failed } = evt;
            // Surface partial failures as an edit error
            if (typeof failed === "number" && failed > 0) {
              const total = (applied || 0) + failed;
              setEditError(prev => {
                const msg = `${failed}/${total} change${total !== 1 ? "s" : ""} in ${filePath.split("/").pop()} could not be applied — SEARCH text didn't match.`;
                return prev ? `${prev}\n${msg}` : msg;
              });
            }
            // Only update the file in the editor if at least one hunk applied (or it's a new file)
            const shouldUpdate = isNew || applied === undefined || applied > 0;
            if (shouldUpdate) {
              setAllFiles(prev => {
                const idx = prev.findIndex(f => f.path === filePath);
                if (idx !== -1) {
                  const next = [...prev];
                  next[idx] = { ...next[idx], content: newContent };
                  return next;
                }
                // New file
                return [...prev, { agent: "Editor", path: filePath, content: newContent, language: filePath.split(".").pop() || "plaintext" }];
              });
              setTabContents(prev => {
                if (prev[filePath] !== undefined) return { ...prev, [filePath]: newContent };
                return prev;
              });
              if (isNew) {
                setExpandedDirs(prev => {
                  const s = new Set(prev);
                  const parts = filePath.split("/");
                  for (let i = 0; i < parts.length - 1; i++) s.add(`${i}:${parts[i]}`);
                  return s;
                });
              }
            }
          } else if (eventName === "edit-complete" || evt.filesChanged !== undefined) {
            setEditChangedFiles(evt.files || []);
          } else if (eventName === "edit-error" || evt.message) {
            setEditError(evt.message || "Edit failed");
          }
        }
      }
    } catch (err) {
      setEditError(err.message);
    }
    setEditingFiles(false);
  }, [currentBuildId, aiProvider, localAiConfig]);

  const requestBuildPlan = useCallback(async (requestText) => {
    const text = String(requestText || "").trim();
    if (!text || planning) return;
    setPlanning(true);
    setBuildPlan(null);
    try {
      const useLocalEngine = aiProvider === "local";
      const engineBase = localEngineUrl.trim().replace(/\/+$/, "");
      if (useLocalEngine && (!engineBase || !localEngineToken.trim())) throw new Error("Local AI planning requires the Local Firebox Engine URL and pairing token.");
      const requestUrl = useLocalEngine ? `${engineBase}/api/plan` : "/api/plan";
      const headers = { "Content-Type": "application/json" };
      if (useLocalEngine) headers.Authorization = `Bearer ${localEngineToken.trim()}`;
      const response = await fetch(requestUrl, { method:"POST", headers, body: JSON.stringify({ description:text, fileNames:allFiles.map(file => file.path), provider:aiProvider, endpoint:localAiConfig.endpoint, model:localAiConfig.model, apiKey:localAiConfig.apiKey, localAi:aiProvider === "local" ? localAiConfig : undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.plan) throw new Error(data.error || "Unable to create a build plan");
      setBuildPlan({ ...data.plan, request:text });
      setChatHistory(prev => [...prev, { role:"ai", text:`${data.plan.summary}\n\n${data.plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nReview the plan above, then choose Start building.` }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role:"ai", text:`I couldn't create the plan yet: ${error.message}` }]);
    } finally {
      setPlanning(false);
    }
  }, [planning, aiProvider, localEngineUrl, localEngineToken, localAiConfig, allFiles]);

  const confirmBuildPlan = useCallback((override = false) => {
    if (!buildPlan?.request || (buildPlan.needsConfirmation && !override)) return;
    const request = buildPlan.request;
    setBuildPlan(null);
    setDescription(request);
    startBuild(request);
  }, [buildPlan, startBuild]);

  /* ── Send chat message — AI replies first, then acts ──────────────────── */
  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    const userMsg = { role: "user", text };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput("");
    setAiThinking(true);
    setAiStreamText("");
    setActivity("workspace");
    setSideOpen(false);
    setTimeout(() => chatInputRef.current?.focus(), 0);

    // Build conversation for the API (last 10 messages for context)
    const historyForApi = [...chatHistory.slice(-9), userMsg];

    try {
      let fullText = "";
      let action = null;

      if (aiProvider === "local") {
        const result = await requestLocalChat({
          config: localAiConfig,
          messages: historyForApi,
          hasFiles: allFiles.length > 0,
          fileNames: allFiles.map(f => f.path),
        });
        fullText = result.text;
        action = result.action;
        setAiStreamText(fullText);
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyForApi,
            hasFiles: allFiles.length > 0,
            fileNames: allFiles.map(f => f.path),
            provider: aiProvider,
            localAi: aiProvider === "local" ? localAiConfig : undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Error ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop();

          for (const part of parts) {
            const line = part.replace(/^data:\s*/, "").trim();
            if (!line) continue;
            let evt;
            try { evt = JSON.parse(line); } catch { continue; }

            if (evt.token) {
              fullText += evt.token;
              setAiStreamText(fullText);
            } else if (evt.done) {
              fullText = evt.text || fullText;
              action = evt.action || null;
            } else if (evt.error) {
              throw new Error(evt.error);
            }
          }
        }
      }

      // Commit the AI reply to history
      if (fullText) {
        setChatHistory(prev => [...prev, { role: "ai", text: fullText }]);
      }
      setAiStreamText("");
      setAiThinking(false);

      // Perform the action the AI decided on
      if (action === "build") {
        await requestBuildPlan(text);
      } else if (action === "edit" && currentBuildId && allFiles.length > 0) {
        startEditFiles(text);
      }
    } catch (err) {
      const message = aiProvider === "local"
        ? `Local AI did not respond in time or returned an error. Check that Ollama is running and try again. (${err.message})`
        : `Sorry, something went wrong: ${err.message}`;
      setChatHistory(prev => [...prev, { role: "ai", text: message }]);
      setAiStreamText("");
      setAiThinking(false);
    }
  }, [chatInput, chatHistory, requestBuildPlan, startEditFiles, currentBuildId, allFiles, aiProvider, localAiConfig]);

  const stopBuild = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    Object.values(agentTimerRefs.current).forEach(({ elapsed, steps }) => { clearInterval(elapsed); steps.forEach(clearTimeout); });
    agentTimerRefs.current = {};
    setActiveAgent(null);
    setPhase("idle");
    setErrorMsg("Agent stopped. No further changes are being made.");
  }, []);

  /* ── Reset ────────────────────────────────────────────────────────────── */
  const reset = () => {
    esRef.current?.close();
    setPhase("idle"); setDescription(""); setAllFiles([]);
    setOpenTabs([]); setActiveTabPath(null); setTabContents({});
    setAgentStates(AGENT_META.map(a => ({name:a.name, status:"idle", streaming:""})));
    setActiveAgent(null); setErrorMsg(""); streamingRef.current = {};
    setActivity("workspace");
    setAgentStartTimes({}); setAgentElapsed({}); setAgentVisSteps({}); setStepsCollapsed({});
    setChatHistory([]); setChatInput("");
    setCurrentBuildId(null);
    setEditingFiles(false); setEditStream(""); setEditChangedFiles([]); setEditError("");
    setAiThinking(false); setAiStreamText("");
    Object.values(agentTimerRefs.current).forEach(({ elapsed, steps }) => {
      clearInterval(elapsed); steps.forEach(clearTimeout);
    });
    agentTimerRefs.current = {};
  };

  /* ── Load a past project into the editor ──────────────────────────────── */
  const loadProjectFiles = useCallback(async (build) => {
    setLoadingProjectId(build._id);
    try {
      const res  = await fetch(`/api/build/${build._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const files = data.files || [];
      if (!files.length) return;
      setAllFiles(files);
      setOpenTabs([]); setActiveTabPath(null); setTabContents({});
      const first = files[0];
      setOpenTabs([first]); setActiveTabPath(first.path);
      setTabContents({ [first.path]: first.content });
      setActivity("explorer"); setSideOpen(true);
      setDescription(build.description);
      setCurrentBuildId(build._id);   // enables edit mode for this project
      setEditingFiles(false); setEditStream(""); setEditChangedFiles([]); setEditError("");
      setPhase("complete");
    } catch (err) { console.error(err); }
    setLoadingProjectId(null);
  }, []);

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

  /* ── Git: load saved token on mount ─────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch("/api/git/token");
        const data = await res.json();
        if (data.token) {
          setGitToken(data.token);
          setGitTokenSaved(true);
          // also pre-load repos
          setGitReposLoading(true);
          try {
            const r2   = await fetch("/api/git/repos");
            const list = await r2.json();
            if (r2.ok) setGitRepos(list);
          } catch {}
          setGitReposLoading(false);
        }
      } catch {}
    })();
  }, []);

  /* ── Git: save token to DB + fetch repos ────────────────────────────────── */
  const saveGitToken = useCallback(async () => {
    if (!gitTokenInput.trim()) return;
    setGitTokenSaving(true); setGitError("");
    try {
      const res = await fetch("/api/git/token", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ token: gitTokenInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGitToken(gitTokenInput);
      setGitTokenSaved(true);
      setGitTokenInput("");
      // fetch repos
      setGitReposLoading(true);
      const r2   = await fetch("/api/git/repos");
      const list = await r2.json();
      if (!r2.ok) throw new Error(list.error);
      setGitRepos(list);
    } catch (err) { setGitError(err.message); }
    setGitReposLoading(false);
    setGitTokenSaving(false);
  }, [gitTokenInput]);

  /* ── Git: remove saved token ─────────────────────────────────────────────── */
  const removeGitToken = useCallback(async () => {
    await fetch("/api/git/token", { method:"DELETE" });
    setGitToken(""); setGitTokenSaved(false); setGitRepos([]);
    setGitRepo(null); setGitFileShas({}); setGitError("");
    setGitPushResult(null); setGitShowPromptStep(false);
  }, []);

  /* ── Git: connect repo ───────────────────────────────────────────────────── */
  const connectGitRepo = useCallback(async (repoFullName) => {
    const token = gitToken;
    if (!repoFullName || !token) return;
    setGitConnecting(true); setGitError(""); setGitRepo(null);
    try {
      const res  = await fetch("/api/git/connect", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ repoUrl: `github.com/${repoFullName}`, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGitRepo(data);
      setGitFileShas({});
      setGitExpandedDirs(new Set());
      setGitPushResult(null);
      setGitShowPromptStep(true);  // show "what changes?" step
      setGitChangePrompt("");
    } catch (err) { setGitError(err.message); }
    setGitConnecting(false);
  }, [gitToken]);

  /* ── Git: open a file from the repo ─────────────────────────────────────── */
  const openGitFile = useCallback(async (filePath) => {
    if (!gitRepo || !gitToken) return;
    setGitLoadingFile(filePath);
    try {
      const res  = await fetch("/api/git/file", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ owner: gitRepo.owner, repo: gitRepo.repo, path: filePath, token: gitToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGitFileShas(prev => ({ ...prev, [filePath]: data.sha }));
      openFile({ path: filePath, content: data.content, agent: "Git", language: "" });
    } catch (err) { setGitError(err.message); }
    setGitLoadingFile(null);
  }, [gitRepo, gitToken, openFile]);

  /* ── Git: AI edit active file ────────────────────────────────────────────── */
  const runGitAiEdit = useCallback(async () => {
    if (!gitInstruction.trim() || !activeTabPath) return;
    const fileContent = tabContents[activeTabPath] ?? openTabs.find(t => t.path === activeTabPath)?.content ?? "";
    if (!fileContent) return;
    setGitAiEditing(true); setGitError("");
    try {
      const res = await fetch("/api/git/ai-edit", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ content: fileContent, path: activeTabPath, instruction: gitInstruction }),
      });
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   newContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.token) {
              newContent += evt.token;
              setTabContents(prev => ({ ...prev, [activeTabPath]: newContent }));
            }
            if (evt.done && evt.content) {
              setTabContents(prev => ({ ...prev, [activeTabPath]: evt.content }));
            }
            if (evt.error) setGitError(evt.error);
          } catch {}
        }
      }
      setGitInstruction("");
      setGitAiOpen(false);
    } catch (err) { setGitError(err.message); }
    setGitAiEditing(false);
  }, [gitInstruction, activeTabPath, tabContents, openTabs]);

  /* ── Git: push active file ───────────────────────────────────────────────── */
  const pushGitFile = useCallback(async () => {
    if (!gitRepo || !gitToken || !activeTabPath) return;
    setGitPushing(true); setGitError(""); setGitPushResult(null);
    try {
      const content = tabContents[activeTabPath] ?? openTabs.find(t => t.path === activeTabPath)?.content ?? "";
      const sha     = gitFileShas[activeTabPath];
      const res  = await fetch("/api/git/push", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          owner: gitRepo.owner, repo: gitRepo.repo, branch: gitRepo.branch,
          path: activeTabPath, content, sha,
          token: gitToken,
          message: gitPushMsg.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGitFileShas(prev => ({ ...prev, [activeTabPath]: undefined }));
      setGitPushResult({ commitUrl: data.commitUrl });
      setGitPushMsg("");
    } catch (err) { setGitError(err.message); setGitPushResult({ error: err.message }); }
    setGitPushing(false);
  }, [gitRepo, gitToken, activeTabPath, openTabs, tabContents, gitFileShas, gitPushMsg]);

  const toggleGitDir = useCallback((key) =>
    setGitExpandedDirs(prev => {
      const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
    }), []);

  /* ── Git: analyze repo with AI agents ───────────────────────────────────── */
  const startAnalyzeRepo = useCallback(async () => {
    if (!gitRepo || !gitToken || gitAnalyzing) return;
    setGitAnalyzing(true);
    setGitShowPromptStep(false);
    setGitError("");

    // Reset agent panel
    setPhase("building");
    setErrorMsg("");
    streamingRef.current = {};
    setAgentStates(AGENT_META.map(a => ({ name: a.name, status: "idle", streaming: "" })));
    setAllFiles([]);
    setOpenTabs([]);
    setActiveTabPath(null);
    setTabContents({});
    setActiveAgent(null);
    setActivity("workspace");
    setAgentStartTimes({});
    setAgentElapsed({});
    setAgentVisSteps({});
    setStepsCollapsed({});
    Object.values(agentTimerRefs.current).forEach(({ elapsed, steps }) => {
      clearInterval(elapsed); steps.forEach(clearTimeout);
    });
    agentTimerRefs.current = {};

    let buildId;
    try {
      const res = await fetch("/api/git/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner:  gitRepo.owner,
          repo:   gitRepo.repo,
          branch: gitRepo.branch,
          token:  gitToken,
          files:  gitRepo.files,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start analysis");
      buildId = data.buildId;
      setCurrentBuildId(data.buildId);
    } catch (err) {
      setPhase("error");
      setErrorMsg(err.message);
      setGitAnalyzing(false);
      return;
    }

    const es = new EventSource(`/api/git/analyze/${buildId}/events`);
    esRef.current = es;

    es.addEventListener("agent-start", e => {
      const { agent } = JSON.parse(e.data);
      setActiveAgent(agent);
      updateAgent(agent, { status: "working", streaming: "" });
      streamingRef.current[agent] = "";

      const startTime = Date.now();
      setAgentStartTimes(prev => ({ ...prev, [agent]: startTime }));
      setAgentElapsed(prev => ({ ...prev, [agent]: 0 }));
      setAgentVisSteps(prev => ({ ...prev, [agent]: 1 }));

      const elapsedId = setInterval(() => {
        setAgentElapsed(prev => ({ ...prev, [agent]: Math.round((Date.now() - startTime) / 1000) }));
      }, 1000);

      const steps = AGENT_STEPS[agent] || [];
      const gap   = steps.length > 1 ? 17000 / (steps.length - 1) : 17000;
      const stepIds = steps.slice(1).map((_, i) =>
        setTimeout(() => {
          setAgentVisSteps(prev => ({ ...prev, [agent]: i + 2 }));
        }, gap * (i + 1))
      );
      agentTimerRefs.current[agent] = { elapsed: elapsedId, steps: stepIds };
    });

    es.addEventListener("agent-token", e => {
      const { agent, token } = JSON.parse(e.data);
      streamingRef.current[agent] = (streamingRef.current[agent] || "") + token;
      updateAgent(agent, { streaming: streamingRef.current[agent] });
    });

    es.addEventListener("agent-complete", e => {
      const { agent, files } = JSON.parse(e.data);
      if (agentTimerRefs.current[agent]) {
        clearInterval(agentTimerRefs.current[agent].elapsed);
        agentTimerRefs.current[agent].steps.forEach(clearTimeout);
        delete agentTimerRefs.current[agent];
      }
      setAgentVisSteps(prev => ({ ...prev, [agent]: (AGENT_STEPS[agent] || []).length }));
      updateAgent(agent, { status: "done", streaming: "" });
      if (files?.length) {
        setAllFiles(prev => {
          const next = [...prev, ...files];
          if (prev.length === 0 && files.length > 0) {
            const f = files[0];
            setOpenTabs([f]);
            setActiveTabPath(f.path);
            setTabContents({ [f.path]: f.content });
            setActivity("explorer");
          }
          return next;
        });
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
      if (agentTimerRefs.current[agent]) {
        clearInterval(agentTimerRefs.current[agent].elapsed);
        agentTimerRefs.current[agent].steps.forEach(clearTimeout);
        delete agentTimerRefs.current[agent];
      }
      setAgentVisSteps(prev => ({ ...prev, [agent]: (AGENT_STEPS[agent] || []).length }));
      updateAgent(agent, { status: "error", streaming: "" });
      setErrorMsg(`${agent}: ${message}`);
    });

    es.addEventListener("build-complete", () => {
      setPhase("complete");
      setActiveAgent(null);
      setGitAnalyzing(false);
      es.close();
      fetch("/api/builds").then(r => r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(() => {});
    });

    es.addEventListener("build-error", e => {
      const { message } = JSON.parse(e.data);
      setPhase("error");
      setErrorMsg(message);
      setGitAnalyzing(false);
      es.close();
    });

    es.onerror = () => {
      setPhase("error");
      setErrorMsg("Connection lost.");
      setGitAnalyzing(false);
      es.close();
    };
  }, [gitRepo, gitToken, gitAnalyzing, updateAgent]);

  /* ── Git: import repo as editable project ───────────────────────────────── */
  const importRepoAsProject = useCallback(async () => {
    if (!gitRepo || !gitToken || gitImporting) return;
    setGitImporting(true);
    setGitShowPromptStep(false);
    setGitError("");

    let buildId, filesCount;
    try {
      const res = await fetch("/api/git/import-as-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner:  gitRepo.owner,
          repo:   gitRepo.repo,
          branch: gitRepo.branch,
          token:  gitToken,
          files:  gitRepo.files,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      buildId    = data.buildId;
      filesCount = data.filesCount;
    } catch (err) {
      setGitError(err.message);
      setGitImporting(false);
      return;
    }

    // Load imported files straight into the editor (same as loadProjectFiles)
    try {
      const res  = await fetch(`/api/build/${buildId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const files = data.files || [];
      setAllFiles(files);
      setOpenTabs([]); setActiveTabPath(null); setTabContents({});
      if (files.length > 0) {
        const first = files[0];
        setOpenTabs([first]);
        setActiveTabPath(first.path);
        setTabContents({ [first.path]: first.content });
        // Expand parent dirs
        files.forEach(f => {
          const parts = f.path.split("/");
          for (let i = 0; i < parts.length - 1; i++) {
            setExpandedDirs(prev => new Set([...prev, `${i}:${parts[i]}`]));
          }
        });
      }
      setDescription(`Imported from GitHub: ${gitRepo.owner}/${gitRepo.repo}`);
      setCurrentBuildId(buildId);
      setEditingFiles(false); setEditStream(""); setEditChangedFiles([]); setEditError("");
      setPhase("complete");
      setActivity("explorer");
      setSideOpen(true);
      // Refresh project history
      fetch("/api/builds").then(r => r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(() => {});
    } catch (err) {
      setGitError(err.message);
    }

    setGitImporting(false);
  }, [gitRepo, gitToken, gitImporting]);

  /* ── Delete a project ───────────────────────────────────────────────────── */
  const deleteProject = useCallback(async (buildId, e) => {
    e.stopPropagation();
    try {
      await fetch(`/api/build/${buildId}`, { method: "DELETE" });
      setRecentBuilds(prev => prev.filter(b => b._id !== buildId));
      setProjectFilesMap(prev => { const n = { ...prev }; delete n[buildId]; return n; });
      setExpandedProjects(prev => { const s = new Set(prev); s.delete(buildId); return s; });
      // If this was the open project, clear the editor
      if (currentBuildId === buildId) reset();
    } catch (err) { console.error("Delete failed", err); }
  }, [currentBuildId, reset]);

  /* ── Load files for a past project ──────────────────────────────────────── */
  const toggleProject = useCallback(async (buildId) => {
    setExpandedProjects(prev => {
      const s = new Set(prev);
      s.has(buildId) ? s.delete(buildId) : s.add(buildId);
      return s;
    });
    if (!projectFilesMap[buildId]) {
      setLoadingProjectId(buildId);
      try {
        const res  = await fetch(`/api/build/${buildId}`);
        const data = await res.json();
        setProjectFilesMap(prev => ({ ...prev, [buildId]: data.files || [] }));
      } catch {}
      setLoadingProjectId(null);
    }
  }, [projectFilesMap]);

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

  /* ── Preview: build iframe-renderable HTML from the active file ────────── */
  const previewContent = useMemo(() => {
    if (!activeFile || !activeContent) return null;
    const ext = activeFile.path.split(".").pop().toLowerCase();
    if (ext === "html" || ext === "htm") return activeContent;
    if (ext === "css") return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #fff; color: #333; }
  ${activeContent}
</style></head><body><div class="preview-container"><p style="color:#888;font-size:12px;font-family:monospace">CSS preview — add HTML elements here to test styles</p></div></body></html>`;
    if (ext === "js" || ext === "ts") return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{margin:16px;font-family:monospace;font-size:13px;background:#1e1e1e;color:#d4d4d4;white-space:pre-wrap;}</style></head>
<body id="out"></body>
<script>
const _log=console.log.bind(console);
const out=document.getElementById("out");
console.log=(...a)=>{out.textContent+=a.map(x=>typeof x==="object"?JSON.stringify(x,null,2):String(x)).join(" ")+"\\n";_log(...a);};
try{${activeContent}}catch(e){out.textContent+="\\n⚠ "+e.message;}
</script></html>`;
    if (ext === "svg") return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1e1e1e;}</style></head><body>${activeContent}</body></html>`;
    if (ext === "md") {
      const escaped = activeContent.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:20px 28px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;max-width:800px;background:#fff;color:#333;}pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow:auto;}code{background:#f4f4f4;padding:1px 5px;border-radius:3px;font-size:13px;}</style></head><body><pre style="white-space:pre-wrap;font-family:inherit">${escaped}</pre></body></html>`;
    }
    return null; // unsupported — no preview
  }, [activeFile, activeContent]);

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
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn      { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin        { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes dotBounce   { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
        @keyframes avatarPulse { 0%,100%{box-shadow:0 0 0 0 transparent} 50%{box-shadow:0 0 8px 2px rgba(255,255,255,0.08)} }
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
        @media (max-width:767px) {
          ::-webkit-scrollbar { width:4px; height:4px; }
        }
      `}</style>

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:VS.editorBg, fontFamily:FONT_UI, color:VS.text, overflow:"hidden" }}>

        {/* ══ Title bar ═══════════════════════════════════════════════════ */}
        <div style={{
          height: isMobile ? 44 : 30, flexShrink:0, background:VS.titleBar,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding: isMobile ? "0 10px" : "0 12px",
          borderBottom:`1px solid ${VS.border}`, WebkitAppRegion:"drag",
          userSelect:"none",
        }}>
          {/* macOS-style traffic lights — hidden on mobile */}
          {!isMobile && (
            <div style={{ display:"flex", gap:6, alignItems:"center", WebkitAppRegion:"no-drag" }}>
              {["#FF5F57","#FFBD2E","#28C840"].map((c,i) => (
                <div key={i} style={{ width:12, height:12, borderRadius:"50%", background:c, flexShrink:0 }}/>
              ))}
            </div>
          )}
          {/* Mobile: hamburger to toggle sidebar */}
          {isMobile && (
            <button
              onClick={() => setSideOpen(p => !p)}
              style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:32, height:32, background: sideOpen ? "#3D3D3D" : "transparent",
                border:`1px solid ${sideOpen ? VS.accent : VS.border}`,
                borderRadius:6, cursor:"pointer", WebkitAppRegion:"no-drag", flexShrink:0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sideOpen ? VS.accent : VS.textMuted} strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}
          {/* Title */}
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:VS.textMuted, flex: isMobile ? 1 : "unset", justifyContent: isMobile ? "center" : "unset", marginLeft: isMobile ? 0 : 0 }}>
            <Zap size={13} color={VS.accent}/>
            <span style={{ color:VS.text, fontWeight:500, fontSize: isMobile ? 13 : 12 }}>Firebox AI Studio</span>
            {!isMobile && activeFile && (
              <>
                <span style={{ color:VS.textFaint }}>—</span>
                <span>{activeFile.path.split("/").pop()}</span>
              </>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 6 : 8, WebkitAppRegion:"no-drag" }}>
            {phase !== "idle" && (
              <button onClick={reset} style={{
                display:"flex", alignItems:"center", gap:5, padding: isMobile ? "4px 8px" : "2px 8px",
                background:"transparent", border:`1px solid ${VS.border}`,
                color:VS.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
              }}>
                <RotateCcw size={11}/>{!isMobile && " New"}
              </button>
            )}

            {/* ── New Project button + dropdown ── */}
            <div ref={newProjRef} style={{ position:"relative" }}>
              <button
                onClick={() => setNewProjOpen(p => !p)}
                disabled={importing}
                style={{
                  display:"flex", alignItems:"center", gap:5,
                  padding: isMobile ? "4px 8px" : "3px 10px",
                  background: newProjOpen ? VS.accent : "rgba(0,120,212,0.15)",
                  border:`1px solid ${newProjOpen ? VS.accent : "rgba(0,120,212,0.4)"}`,
                  color: newProjOpen ? "#fff" : VS.accent,
                  fontSize:11, borderRadius:5, cursor:"pointer",
                  fontWeight:500, transition:"all 0.15s",
                  opacity: importing ? 0.6 : 1,
                }}
              >
                {importing
                  ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/>{!isMobile && " Importing…"}</>
                  : <><Plus size={11}/>{!isMobile && " New Project"}</>
                }
              </button>

              {newProjOpen && (
                <div style={{
                  position:"absolute", top:"calc(100% + 6px)", right:0, zIndex:200,
                  width:200, background:"#252526",
                  border:`1px solid ${VS.border}`, borderRadius:8,
                  boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                  overflow:"hidden", animation:"fadeIn 0.12s ease",
                }}>
                  {/* Header */}
                  <div style={{ padding:"8px 12px 6px", fontSize:10, fontWeight:700, color:VS.textMuted, letterSpacing:"0.08em", borderBottom:`1px solid ${VS.border}` }}>
                    NEW PROJECT
                  </div>

                  {[
                    { Icon:FolderOpen, label:"Import Folder",      sub:"Open a local directory", action:importFolder },
                    { Icon:Upload,     label:"Upload ZIP",          sub:"Extract from .zip file",  action:importZip },
                    { Icon:Github,     label:"Import from GitHub",  sub:"Browse your repositories",action:importGithub },
                  ].map(({ Icon, label, sub, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      style={{
                        display:"flex", alignItems:"center", gap:10,
                        width:"100%", padding:"9px 12px",
                        background:"transparent", border:"none",
                        cursor:"pointer", textAlign:"left",
                        transition:"background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background="#2A2D2E"}
                      onMouseLeave={e => e.currentTarget.style.background="transparent"}
                    >
                      <div style={{
                        width:28, height:28, borderRadius:6, flexShrink:0,
                        background:"rgba(255,255,255,0.05)",
                        border:`1px solid ${VS.border}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        <Icon size={13} color={VS.textMuted}/>
                      </div>
                      <div>
                        <div style={{ fontSize:12, color:VS.text, fontWeight:500 }}>{label}</div>
                        <div style={{ fontSize:10, color:VS.textFaint, marginTop:1 }}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setHistoryOpen(p=>!p)} style={{
              display:"flex", alignItems:"center", gap:5, padding: isMobile ? "4px 8px" : "2px 8px",
              background: historyOpen ? "#3D3D3D" : "transparent",
              border:`1px solid ${VS.border}`,
              color:VS.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
            }}>
              <History size={11}/>{!isMobile && " History"}
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
        <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative" }}>

          {/* ── Activity bar — desktop: left column; mobile: bottom strip ── */}
          {(() => {
            const navItems = [
              { id:"home",     Icon:Home,      title:"Home" },
              { id:"explorer", Icon:Files,     title:"Explorer",    badge: allFiles.length || null },
              { id:"agents",   Icon:Cpu,       title:"AI Agents",   badge: activeAgent ? "●" : null, badgeColor:"#DCDCAA" },
              { id:"workspace",Icon:Workflow, title:"Workspace",   badge: activeAgent ? "●" : null, badgeColor:"#DCDCAA" },
              { id:"projects", Icon:Package,   title:"Projects",    badge: recentBuilds.length || null },
              { id:"search",   Icon:Search,    title:"Search"  },
              { id:"git",      Icon:GitBranch, title:"Source Control" },
            ];
            if (isMobile) {
              return (
                <div style={{
                  position:"absolute", bottom:0, left:0, right:0, zIndex:200,
                  height:52, flexShrink:0, background:VS.activityBar,
                  borderTop:`1px solid ${VS.border}`,
                  display:"flex", flexDirection:"row", alignItems:"center",
                  justifyContent:"space-around",
                }}>
                  {navItems.map(({ id, Icon, title, badge, badgeColor }) => (
                    <button
                      key={id}
                      className="act-btn"
                      title={title}
                      onClick={() => { if (id === "home") { reset(); setActivity("home"); setSideOpen(false); } else if (id === "agents") { setActivity("agents"); setSideOpen(false); } else if (id === "workspace") { setActivity("workspace"); setSideOpen(false); } else { setActivity(id); setSideOpen(p => activity===id ? !p : true); } }}
                      style={{
                        position:"relative", display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center",
                        flex:1, height:52, background:"transparent", border:"none",
                        borderTop:`2px solid ${activity===id && sideOpen ? VS.accent : "transparent"}`,
                        color: activity===id && sideOpen ? VS.textActive : VS.textMuted,
                        cursor:"pointer", transition:"color 0.15s", gap:3,
                      }}
                    >
                      <Icon size={18}/>
                      <span style={{ fontSize:9, fontWeight:500 }}>{title}</span>
                      {badge && (
                        <span style={{
                          position:"absolute", top:4, right:"calc(50% - 16px)", minWidth:14, height:14, borderRadius:7,
                          background: badgeColor || VS.accent, color:"#fff",
                          fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                          padding:"0 3px",
                        }}>{typeof badge==="number" ? badge : null}</span>
                      )}
                    </button>
                  ))}
                  <button className="act-btn" title="Settings" onClick={() => { setActivity("settings"); setSideOpen(true); }} style={{
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                    flex:1, height:52, background:"transparent", border:"none",
                    borderTop:`2px solid ${activity === "settings" && sideOpen ? VS.accent : "transparent"}`, color: activity === "settings" && sideOpen ? VS.textActive : VS.textMuted, cursor:"pointer", gap:3,
                  }}>
                    <Settings size={18}/>
                    <span style={{ fontSize:9, fontWeight:500 }}>Settings</span>
                  </button>
                </div>
              );
            }
            return (
              <div style={{
                width:navExpanded ? 176 : 48, flexShrink:0, background:VS.activityBar,
                borderRight:`1px solid ${VS.border}`,
                display:"flex", flexDirection:"column", alignItems:"stretch",
                paddingTop:8, gap:0, transition:"width 0.2s ease",
              }}>
                <button
                  className="act-btn"
                  title={navExpanded ? "Collapse sidebar" : "Expand sidebar"}
                  onClick={() => setNavExpanded(prev => { const next = !prev; try { localStorage.setItem("firebox-nav-expanded", String(next)); } catch {} return next; })}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:navExpanded ? "flex-end" : "center",
                    width:"100%", height:34, padding:navExpanded ? "0 14px" : 0,
                    background:"transparent", border:"none", color:VS.textMuted, cursor:"pointer",
                  }}
                >
                  {navExpanded ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
                </button>
                {navItems.map(({ id, Icon, title, badge, badgeColor }) => (
                  <button
                    key={id}
                    className="act-btn"
                    title={title}
                    onClick={() => { if (id === "home") { reset(); setActivity("home"); setSideOpen(false); } else if (id === "agents") { setActivity("agents"); setSideOpen(false); } else if (id === "workspace") { setActivity("workspace"); setSideOpen(false); } else { setActivity(id); setSideOpen(p => activity===id ? !p : true); } }}
                    style={{
                      position:"relative", display:"flex", flexDirection:"row", alignItems:"center", justifyContent:navExpanded ? "flex-start" : "center",
                      gap:navExpanded ? 11 : 0, width:"100%", height:44, padding:navExpanded ? "0 14px" : 0,
                      background:activity===id ? "rgba(0,120,212,0.08)" : "transparent", border:"none",
                      borderLeft:`2px solid ${activity===id ? VS.accent : "transparent"}`,
                      color: activity===id ? VS.textActive : VS.textMuted,
                      cursor:"pointer", transition:"color 0.15s, background 0.15s",
                    }}
                  >
                    <Icon size={20}/>
                    {navExpanded && <span style={{ fontSize:12, fontWeight:activity===id ? 600 : 500 }}>{title}</span>}
                    {badge && (
                      <span style={{
                        position:navExpanded ? "static" : "absolute", top:6, right:6, minWidth:14, height:14, borderRadius:7,
                        marginLeft:navExpanded ? "auto" : 0,
                        background: badgeColor || VS.accent, color:"#fff",
                        fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                        padding:"0 3px",
                      }}>{typeof badge==="number" ? badge : null}</span>
                    )}
                  </button>
                ))}
                <div style={{ flex:1 }}/>
                <button className="act-btn" title="Settings" onClick={() => { setActivity("settings"); setSideOpen(true); }} style={{
                  display:"flex", flexDirection:"row", alignItems:"center", justifyContent:navExpanded ? "flex-start" : "center", gap:navExpanded ? 11 : 0,
                  width:"100%", height:44, padding:navExpanded ? "0 14px" : 0, background:activity === "settings" ? "rgba(0,120,212,0.08)" : "transparent", border:"none",
                  borderLeft:`2px solid ${activity === "settings" ? VS.accent : "transparent"}`, color: activity === "settings" ? VS.textActive : VS.textMuted, cursor:"pointer", marginBottom:4,
                }}>
                  <Settings size={20}/>{navExpanded && <span style={{ fontSize:12, fontWeight:activity === "settings" ? 600 : 500 }}>Settings</span>}
                </button>
              </div>
            );
          })()}

          {/* ── Side panel ────────────────────────────────────────────── */}
          {/* ── Side panel + Editor: mobile keeps absolute overlay; desktop uses PanelGroup ── */}
          {(() => {
            /* side panel inner content — shared by mobile overlay & desktop Panel */
            const sideContent = (
              <React.Fragment>

              {/* Panel: Provider settings */}
              {activity === "settings" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    PROVIDER SETTINGS
                  </div>
                  <div style={{ flex:1, overflowY:"auto", padding:"4px 12px 18px" }}>
                    <div style={{ fontSize:12, color:VS.text, lineHeight:1.5, marginBottom:14 }}>
                      Choose which model responds to Firebox requests. Cloud AI stays available as the default provider.
                    </div>

                    <div style={{ fontSize:10, color:VS.textMuted, fontWeight:700, letterSpacing:"0.08em", marginBottom:6 }}>AI PROVIDER</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16 }}>
                      {[{ id:"cloud", label:"Cloud AI" }, { id:"local", label:"Local AI" }].map(({ id, label }) => (
                        <button
                          key={id}
                          onClick={() => { setAiProvider(id); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          style={{
                            padding:"9px 8px", borderRadius:5, cursor:"pointer", fontFamily:FONT_UI,
                            border:`1px solid ${aiProvider === id ? VS.accent : VS.border}`,
                            background: aiProvider === id ? "rgba(0,120,212,0.18)" : "transparent",
                            color: aiProvider === id ? VS.textActive : VS.textMuted,
                            fontSize:11, fontWeight:600,
                          }}
                        >{label}</button>
                      ))}
                    </div>

                    {aiProvider === "local" && (
                      <>
                        <label style={{ display:"block", fontSize:10, color:VS.textMuted, fontWeight:700, marginBottom:5 }}>
                          OLLAMA / OPENAI-COMPATIBLE ENDPOINT
                        </label>
                        <input
                          value={localAiEndpoint}
                          onChange={e => { setLocalAiEndpoint(e.target.value); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          placeholder="http://127.0.0.1:11434/v1"
                          spellCheck="false"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:VS.editorBg, border:`1px solid ${VS.border}`, borderRadius:4, color:VS.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:VS.textMuted, fontWeight:700, marginBottom:5 }}>
                          MODEL IDENTIFIER
                        </label>
                        <input
                          value={localAiModel}
                          onChange={e => { setLocalAiModel(e.target.value); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          placeholder="Enter any compatible local model"
                          spellCheck="false"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:VS.editorBg, border:`1px solid ${VS.border}`, borderRadius:4, color:VS.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:VS.textMuted, fontWeight:700, marginBottom:5 }}>
                          OPTIONAL API KEY
                        </label>
                        <input
                          type="password"
                          value={localAiApiKey}
                          onChange={e => { setLocalAiApiKey(e.target.value); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          placeholder="Leave blank if not required"
                          autoComplete="off"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:VS.editorBg, border:`1px solid ${VS.border}`, borderRadius:4, color:VS.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:VS.textMuted, fontWeight:700, marginBottom:5 }}>
                          LOCAL FIREBOX ENGINE URL
                        </label>
                        <input
                          value={localEngineUrl}
                          onChange={e => setLocalEngineUrl(e.target.value)}
                          placeholder="http://127.0.0.1:8787"
                          spellCheck="false"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:VS.editorBg, border:`1px solid ${VS.border}`, borderRadius:4, color:VS.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:VS.textMuted, fontWeight:700, marginBottom:5 }}>
                          LOCAL ENGINE PAIRING TOKEN
                        </label>
                        <input
                          type="password"
                          value={localEngineToken}
                          onChange={e => setLocalEngineToken(e.target.value)}
                          placeholder="Token from the Windows Local Engine"
                          autoComplete="off"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:VS.editorBg, border:`1px solid ${VS.border}`, borderRadius:4, color:VS.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <button
                          onClick={testLocalAi}
                          disabled={localAiTestState === "testing"}
                          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"8px 10px", borderRadius:4, border:`1px solid ${VS.borderLight}`, background:localAiTestState === "testing" ? "rgba(255,255,255,0.05)" : VS.activityBar, color:VS.text, cursor:localAiTestState === "testing" ? "wait" : "pointer", fontSize:11, fontWeight:600 }}
                        >
                          {localAiTestState === "testing" ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <Zap size={13}/>} Test Local AI
                        </button>

                        <button
                          onClick={testLocalEngine}
                          disabled={localAiTestState === "testing"}
                          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"8px 10px", marginTop:7, borderRadius:4, border:`1px solid ${VS.borderLight}`, background:VS.activityBar, color:VS.text, cursor:localAiTestState === "testing" ? "wait" : "pointer", fontSize:11, fontWeight:600 }}
                        >
                          <Server size={13}/> Test Local Engine
                        </button>

                        {localAiTestState !== "idle" && (
                          <div style={{ marginTop:9, padding:"8px 9px", borderRadius:4, fontSize:10, lineHeight:1.45, color:localAiTestState === "success" ? VS.success : localAiTestState === "error" ? VS.error : VS.textMuted, background:"rgba(255,255,255,0.04)", border:`1px solid ${localAiTestState === "success" ? "rgba(78,201,148,0.35)" : localAiTestState === "error" ? "rgba(244,135,113,0.35)" : VS.border}` }}>
                            {localAiTestState === "success" ? "Connection works: " : localAiTestState === "error" ? "Connection failed: " : "Testing…"}{localAiTestMessage}
                          </div>
                        )}

                        <div style={{ marginTop:14, fontSize:10, color:VS.textFaint, lineHeight:1.5 }}>
                          Local chat contacts Ollama directly. Full Local AI builds use the Windows Local Firebox Engine at the URL above; Cloud AI continues using Railway normally. Never expose the engine port publicly.
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

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

              {/* Panel: Agent pipeline — conversational activity feed */}
              {activity === "agents" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>AGENT PIPELINE</span>
                    {phase !== "idle" && (
                      <span style={{ fontSize:10, color: phase==="complete" ? VS.success : VS.textMuted, fontWeight:500, letterSpacing:0 }}>
                        {phase==="complete" ? `✓ ${doneCount}/${AGENT_META.length} done` : `${doneCount}/${AGENT_META.length}`}
                      </span>
                    )}
                  </div>

                  {/* Thin progress bar */}
                  {phase !== "idle" && (
                    <div style={{ height:2, background:"rgba(255,255,255,0.06)", flexShrink:0, margin:"0 12px 2px" }}>
                      <div style={{
                        height:"100%", borderRadius:1, transition:"width 0.5s ease",
                        background: phase==="complete" ? VS.success : VS.accent,
                        width:`${progress}%`,
                      }}/>
                    </div>
                  )}

                  {/* ── Scrollable feed ──────────────────────────────────── */}
                  <div ref={terminalRef} style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>

                    {/* Empty-state: prompt suggestion cards */}
                    {chatHistory.length === 0 && phase === "idle" && (
                      <div style={{ padding:"16px 2px 8px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                          <Sparkles size={14} color={VS.accent} style={{ opacity:0.85 }}/>
                          <span style={{ fontSize:12, fontWeight:700, color:VS.textActive }}>
                            What would you like to build?
                          </span>
                        </div>
                        <div style={{
                          display:"grid",
                          gridTemplateColumns:"1fr 1fr",
                          gap:7,
                        }}>
                          {PROMPT_SUGGESTIONS.map(({ icon, label, prompt }) => (
                            <button
                              key={label}
                              onClick={() => {
                                setChatInput(prompt);
                                setTimeout(() => chatInputRef.current?.focus(), 0);
                              }}
                              style={{
                                display:"flex", flexDirection:"column", alignItems:"flex-start",
                                gap:4, padding:"10px 10px 9px",
                                background:"rgba(255,255,255,0.04)",
                                border:"1px solid rgba(255,255,255,0.09)",
                                borderRadius:10, cursor:"pointer",
                                textAlign:"left", transition:"all 0.15s",
                                fontFamily:FONT_UI,
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = "rgba(0,120,212,0.12)";
                                e.currentTarget.style.borderColor = "rgba(0,120,212,0.45)";
                                e.currentTarget.style.transform = "translateY(-1px)";
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                                e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
                                e.currentTarget.style.transform = "translateY(0)";
                              }}
                            >
                              <span style={{ fontSize:16, lineHeight:1 }}>{icon}</span>
                              <span style={{ fontSize:11, fontWeight:600, color:VS.textActive, lineHeight:1.3 }}>
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize:10, color:VS.textFaint, marginTop:12, textAlign:"center", lineHeight:1.6 }}>
                          Click a card to use it as your prompt, or type your own below
                        </div>
                      </div>
                    )}

                    {/* Chat history — user + AI bubbles */}
                    {chatHistory.map((msg, i) => (
                      msg.role === "user" ? (
                        <div key={i} style={{
                          display:"flex", flexDirection:"column", alignItems:"flex-end",
                          marginBottom:10, animation:"fadeIn 0.2s ease",
                        }}>
                          <div style={{ fontSize:10, color:VS.textFaint, marginBottom:3, paddingRight:2 }}>
                            💬 You
                          </div>
                          <div style={{
                            maxWidth:"90%", padding:"8px 12px", borderRadius:"10px 10px 2px 10px",
                            background: VS.accent, color:"#fff",
                            fontSize:12, lineHeight:1.5, fontFamily:FONT_MONO,
                            wordBreak:"break-word",
                          }}>
                            {msg.text}
                          </div>
                        </div>
                      ) : (
                        <div key={i} style={{
                          display:"flex", flexDirection:"column", alignItems:"flex-start",
                          marginBottom:10, animation:"fadeIn 0.2s ease",
                        }}>
                          <div style={{ fontSize:10, color:VS.textFaint, marginBottom:3, paddingLeft:2 }}>
                            ⚡ Firebox AI
                          </div>
                          <div style={{
                            maxWidth:"92%", padding:"8px 12px", borderRadius:"10px 10px 10px 2px",
                            background:"rgba(255,255,255,0.06)",
                            border:"1px solid rgba(255,255,255,0.09)",
                            color: VS.text,
                            fontSize:12, lineHeight:1.6, fontFamily:FONT_UI,
                            wordBreak:"break-word", whiteSpace:"pre-wrap",
                          }}>
                            {msg.text}
                          </div>
                        </div>
                      )
                    ))}

                    {/* Streaming AI reply bubble */}
                    {(aiThinking || aiStreamText) && (
                      <div style={{
                        display:"flex", flexDirection:"column", alignItems:"flex-start",
                        marginBottom:10, animation:"fadeIn 0.2s ease",
                      }}>
                        <div style={{ fontSize:10, color:VS.textFaint, marginBottom:3, paddingLeft:2 }}>
                          ⚡ Firebox AI
                        </div>
                        <div style={{
                          maxWidth:"92%", padding:"8px 12px", borderRadius:"10px 10px 10px 2px",
                          background:"rgba(255,255,255,0.06)",
                          border:"1px solid rgba(0,120,212,0.25)",
                          color: VS.text,
                          fontSize:12, lineHeight:1.6, fontFamily:FONT_UI,
                          wordBreak:"break-word", whiteSpace:"pre-wrap",
                        }}>
                          {aiStreamText || <ThinkingDots/>}
                        </div>
                      </div>
                    )}

                    {/* Activity feed — one card per started agent */}
                    {AGENT_META.map(({ name, Icon, color }) => {
                      const state    = agentStates.find(a => a.name === name);
                      if (!state || state.status === "idle") return null;

                      const isActive   = state.status === "working";
                      const isDone     = state.status === "done";
                      const isError    = state.status === "error";
                      const steps      = AGENT_STEPS[name] || [];
                      const visCount   = agentVisSteps[name] || 0;
                      const elapsed    = agentElapsed[name] || 0;
                      const isCollapsed = stepsCollapsed[name] !== false; // default collapsed

                      return (
                        <div key={name} style={{
                          marginBottom:10, borderRadius:10,
                          background:"rgba(255,255,255,0.03)",
                          border:`1px solid ${isActive ? color+"35" : "rgba(255,255,255,0.07)"}`,
                          overflow:"hidden", animation:"fadeIn 0.3s ease",
                          boxShadow: isActive ? `0 0 0 1px ${color}15, 0 4px 20px rgba(0,0,0,0.25)` : "0 2px 8px rgba(0,0,0,0.15)",
                          transition:"border-color 0.3s, box-shadow 0.3s",
                        }}>
                          {/* Card header */}
                          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 12px" }}>
                            {/* Avatar */}
                            <div style={{
                              width:32, height:32, borderRadius:8, flexShrink:0,
                              background:`${color}18`,
                              border:`1px solid ${color}35`,
                              display:"flex", alignItems:"center", justifyContent:"center",
                              animation: isActive ? "avatarPulse 2s ease-in-out infinite" : "none",
                            }}>
                              {isActive
                                ? <Loader2 size={14} color={color} style={{ animation:"spin 1s linear infinite" }}/>
                                : <Icon size={14} color={isDone ? color : isError ? VS.error : VS.textMuted}/>
                              }
                            </div>

                            {/* Name + subtitle */}
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{
                                  fontSize:13, fontWeight:600,
                                  color: isActive ? VS.textActive : isDone ? VS.text : VS.textMuted,
                                }}>
                                  {name}
                                </span>
                                {isDone && <CheckCircle2 size={13} color={VS.success}/>}
                                {isError && <AlertTriangle size={13} color={VS.error}/>}
                              </div>
                              <div style={{ fontSize:11, marginTop:1 }}>
                                {isDone   && <span style={{ color:VS.textMuted }}>Worked for {elapsed}s</span>}
                                {isActive && <ThinkingDots/>}
                                {isError  && <span style={{ color:VS.error }}>Failed</span>}
                              </div>
                            </div>

                            {/* Collapse/expand chip */}
                            {visCount > 0 && (
                              <button
                                onClick={() => setStepsCollapsed(prev => ({ ...prev, [name]: !isCollapsed }))}
                                style={{
                                  display:"flex", alignItems:"center", gap:4,
                                  padding:"3px 8px", borderRadius:20,
                                  background:"rgba(255,255,255,0.06)",
                                  border:"1px solid rgba(255,255,255,0.1)",
                                  color:VS.textMuted, fontSize:11, cursor:"pointer",
                                  flexShrink:0, transition:"background 0.15s",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.1)"}
                                onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                              >
                                {visCount} action{visCount!==1?"s":""}
                                {isCollapsed
                                  ? <ChevronRight size={10}/>
                                  : <ChevronDown  size={10}/>}
                              </button>
                            )}
                          </div>

                          {/* Sub-steps (hidden by default, expand on click) */}
                          {!isCollapsed && visCount > 0 && (
                            <div style={{
                              borderTop:"1px solid rgba(255,255,255,0.06)",
                              padding:"6px 12px 8px",
                            }}>
                              {steps.slice(0, visCount).map((step, i) => (
                                <div key={i} style={{
                                  display:"flex", alignItems:"center", gap:8,
                                  padding:"3px 0", animation:"fadeIn 0.2s ease",
                                }}>
                                  <span style={{ fontSize:13, flexShrink:0, lineHeight:1 }}>{step.icon}</span>
                                  <span style={{
                                    fontSize:12, lineHeight:1.4,
                                    color: i === visCount-1 && isActive ? VS.text : VS.textMuted,
                                  }}>
                                    {step.text}
                                  </span>
                                  {i === visCount-1 && isActive && (
                                    <span style={{
                                      width:4, height:4, borderRadius:"50%",
                                      background:color, flexShrink:0,
                                      animation:"pulse 0.9s ease-in-out infinite",
                                    }}/>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Edit progress card */}
                    {(editingFiles || editChangedFiles.length > 0 || editError) && (
                      <div style={{
                        marginBottom:10, borderRadius:10,
                        background:"rgba(255,255,255,0.03)",
                        border:`1px solid ${editingFiles ? "rgba(0,120,212,0.35)" : editError ? "rgba(244,135,113,0.25)" : "rgba(78,201,148,0.2)"}`,
                        overflow:"hidden", animation:"fadeIn 0.3s ease",
                        boxShadow: editingFiles ? "0 0 0 1px rgba(0,120,212,0.15), 0 4px 20px rgba(0,0,0,0.25)" : "0 2px 8px rgba(0,0,0,0.15)",
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 12px" }}>
                          <div style={{
                            width:32, height:32, borderRadius:8, flexShrink:0,
                            background: editingFiles ? "rgba(0,120,212,0.15)" : editError ? "rgba(244,135,113,0.12)" : "rgba(78,201,148,0.12)",
                            border:`1px solid ${editingFiles ? "rgba(0,120,212,0.35)" : editError ? "rgba(244,135,113,0.25)" : "rgba(78,201,148,0.25)"}`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            {editingFiles
                              ? <Loader2 size={14} color="#0078D4" style={{ animation:"spin 1s linear infinite" }}/>
                              : editError
                              ? <AlertTriangle size={14} color={VS.error}/>
                              : <CheckCircle2 size={14} color={VS.success}/>
                            }
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: editError ? VS.error : editingFiles ? "#0078D4" : VS.success }}>
                              {editingFiles ? "Editing files…" : editError ? "Edit failed" : `${editChangedFiles.length} file${editChangedFiles.length !== 1 ? "s" : ""} updated`}
                            </div>
                            <div style={{ fontSize:11, color:VS.textMuted, marginTop:1 }}>
                              {editingFiles
                                ? <ThinkingDots/>
                                : editError
                                ? editError
                                : editChangedFiles.map(f => f.path.split("/").pop()).join(", ")
                              }
                            </div>
                          </div>
                        </div>
                        {/* Streaming preview */}
                        {editingFiles && editStream && (
                          <div style={{
                            borderTop:"1px solid rgba(255,255,255,0.06)",
                            padding:"6px 12px 8px",
                            maxHeight:80, overflowY:"auto",
                          }}>
                            <pre style={{
                              margin:0, fontSize:10, color:VS.textFaint,
                              fontFamily:FONT_MONO, whiteSpace:"pre-wrap", wordBreak:"break-all",
                              lineHeight:1.5,
                            }}>{editStream.slice(-400)}</pre>
                          </div>
                        )}
                        {/* Changed file chips */}
                        {!editingFiles && !editError && editChangedFiles.length > 0 && (
                          <div style={{
                            borderTop:"1px solid rgba(255,255,255,0.06)",
                            padding:"6px 12px 8px",
                            display:"flex", flexWrap:"wrap", gap:5,
                          }}>
                            {editChangedFiles.map(f => (
                              <span key={f.path} style={{
                                fontSize:11, color: f.isNew ? "#0078D4" : VS.success,
                                background: f.isNew ? "rgba(0,120,212,0.1)" : "rgba(78,201,148,0.08)",
                                border:`1px solid ${f.isNew ? "rgba(0,120,212,0.2)" : "rgba(78,201,148,0.2)"}`,
                                borderRadius:4, padding:"1px 6px", fontFamily:FONT_MONO,
                              }}>
                                {f.isNew ? "+" : "~"} {f.path.split("/").pop()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error banner */}
                    {errorMsg && (
                      <div style={{ marginTop:6, padding:"8px 12px", borderRadius:8, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.2)`, display:"flex", gap:7 }}>
                        <AlertTriangle size={12} color={VS.error} style={{ flexShrink:0, marginTop:1 }}/>
                        <span style={{ fontSize:11, color:VS.error, lineHeight:1.5 }}>{errorMsg}</span>
                      </div>
                    )}

                    {/* Build complete banner */}
                    {phase === "complete" && !aiThinking && !editingFiles && (
                      <div style={{ marginTop:6, padding:"10px 14px", borderRadius:10, background:"rgba(78,201,148,0.08)", border:`1px solid rgba(78,201,148,0.2)`, display:"flex", alignItems:"center", gap:8, animation:"fadeIn 0.3s ease" }}>
                        <CheckCircle2 size={14} color={VS.success}/>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:VS.success }}>Build complete</div>
                          <div style={{ fontSize:11, color:VS.textMuted, marginTop:1 }}>Chat with AI below — ask questions, request changes, or click <strong style={{color:VS.text}}>New project</strong> to start fresh.</div>
                        </div>
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

              {/* Panel: Git */}
              {activity === "git" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>SOURCE CONTROL</span>
                    {gitRepo && (
                      <button
                        onClick={() => { setGitRepo(null); setGitFileShas({}); setGitError(""); setGitPushResult(null); setGitShowPromptStep(false); setGitChangePrompt(""); }}
                        style={{ background:"transparent", border:"none", color:VS.textMuted, cursor:"pointer", padding:2 }} title="Back to repo list">
                        <X size={12}/>
                      </button>
                    )}
                  </div>

                  <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>

                    {/* ── Step 1: Token entry (no saved token) ── */}
                    {!gitRepo && !gitTokenSaved && (
                      <div style={{ padding:"10px 10px 0" }}>
                        <div style={{ fontSize:12, color:VS.textMuted, marginBottom:10, lineHeight:1.6 }}>
                          Enter your GitHub personal access token to see all your repositories.
                        </div>

                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                          <Key size={12} color={VS.textMuted} style={{ flexShrink:0 }}/>
                          <input
                            type="password"
                            value={gitTokenInput}
                            onChange={e => setGitTokenInput(e.target.value)}
                            onKeyDown={e => e.key==="Enter" && saveGitToken()}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            style={{
                              flex:1, background:"#3C3C3C", border:`1px solid ${VS.border}`,
                              borderRadius:4, padding:"5px 8px", color:VS.text,
                              fontSize:12, outline:"none", fontFamily:FONT_MONO,
                            }}
                            onFocus={e => (e.target.style.borderColor=VS.accent)}
                            onBlur={e  => (e.target.style.borderColor=VS.border)}
                          />
                        </div>

                        <button
                          onClick={saveGitToken}
                          disabled={gitTokenSaving || !gitTokenInput.trim()}
                          className="build-btn"
                          style={{
                            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                            width:"100%", padding:"7px", borderRadius:4, border:"none",
                            background: gitTokenInput.trim() ? VS.accent : "#3C3C3C",
                            color:"#fff", fontSize:12, fontWeight:600, cursor: gitTokenInput.trim() ? "pointer" : "not-allowed",
                          }}
                        >
                          {gitTokenSaving
                            ? <><Loader2 size={12} style={{ animation:"spin 1s linear infinite" }}/> Connecting…</>
                            : <><GitBranch size={12}/> Connect GitHub</>}
                        </button>

                        {gitError && (
                          <div style={{ marginTop:8, padding:"6px 8px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:6 }}>
                            <AlertTriangle size={11} color={VS.error} style={{ flexShrink:0, marginTop:1 }}/>
                            <span style={{ fontSize:11, color:VS.error, lineHeight:1.5 }}>{gitError}</span>
                          </div>
                        )}

                        <div style={{ marginTop:10, fontSize:11, color:VS.textFaint, lineHeight:1.6 }}>
                          Generate a token at{" "}
                          <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noreferrer"
                            style={{ color:VS.accent }}>github.com/settings/tokens</a>
                          {" "}with <code style={{ fontSize:10, background:"#3C3C3C", padding:"1px 4px", borderRadius:3 }}>repo</code> scope.
                          The token is saved to your database.
                        </div>
                      </div>
                    )}

                    {/* ── Step 2: Repo picker (token saved, no repo selected) ── */}
                    {!gitRepo && gitTokenSaved && (
                      <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
                        {/* Header row */}
                        <div style={{ padding:"6px 10px", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                          <div style={{ position:"relative", flex:1 }}>
                            <Search size={11} color={VS.textMuted} style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}/>
                            <input
                              value={gitRepoFilter}
                              onChange={e => setGitRepoFilter(e.target.value)}
                              placeholder="Filter repositories…"
                              style={{
                                width:"100%", background:"#3C3C3C", border:`1px solid ${VS.border}`,
                                borderRadius:4, padding:"5px 8px 5px 24px", color:VS.text,
                                fontSize:12, outline:"none", fontFamily:FONT_UI, boxSizing:"border-box",
                              }}
                              onFocus={e => (e.target.style.borderColor=VS.accent)}
                              onBlur={e  => (e.target.style.borderColor=VS.border)}
                            />
                          </div>
                          <button
                            onClick={() => { setGitReposLoading(true); fetch("/api/git/repos").then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setGitRepos(d); setGitReposLoading(false); }).catch(()=>setGitReposLoading(false)); }}
                            title="Refresh repositories"
                            style={{ background:"transparent", border:"none", color:VS.textMuted, cursor:"pointer", padding:4, flexShrink:0 }}
                          >
                            <RefreshCw size={12}/>
                          </button>
                          <button onClick={removeGitToken} title="Disconnect GitHub account"
                            style={{ background:"transparent", border:"none", color:VS.textMuted, cursor:"pointer", padding:4, flexShrink:0 }}>
                            <X size={12}/>
                          </button>
                        </div>

                        {gitError && (
                          <div style={{ margin:"0 10px 6px", padding:"6px 8px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:6 }}>
                            <AlertTriangle size={11} color={VS.error} style={{ flexShrink:0, marginTop:1 }}/>
                            <span style={{ fontSize:11, color:VS.error, lineHeight:1.5, flex:1 }}>{gitError}</span>
                            <button onClick={() => setGitError("")} style={{ background:"none", border:"none", cursor:"pointer", color:VS.textMuted, padding:0 }}><X size={10}/></button>
                          </div>
                        )}

                        {/* Repos list */}
                        <div style={{ flex:1, overflowY:"auto" }}>
                          {gitReposLoading ? (
                            <div style={{ padding:"20px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                              <Loader2 size={14} color={VS.textMuted} style={{ animation:"spin 1s linear infinite" }}/>
                              <span style={{ fontSize:12, color:VS.textMuted }}>Loading repositories…</span>
                            </div>
                          ) : gitConnecting ? (
                            <div style={{ padding:"20px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                              <Loader2 size={14} color={VS.textMuted} style={{ animation:"spin 1s linear infinite" }}/>
                              <span style={{ fontSize:12, color:VS.textMuted }}>Connecting…</span>
                            </div>
                          ) : gitRepos.filter(r => !gitRepoFilter || r.fullName.toLowerCase().includes(gitRepoFilter.toLowerCase())).length === 0 ? (
                            <div style={{ padding:"20px 10px", textAlign:"center", fontSize:12, color:VS.textFaint }}>
                              {gitRepos.length === 0 ? "No repositories found." : "No matches."}
                            </div>
                          ) : (
                            gitRepos
                              .filter(r => !gitRepoFilter || r.fullName.toLowerCase().includes(gitRepoFilter.toLowerCase()))
                              .map(r => (
                                <button
                                  key={r.id}
                                  onClick={() => connectGitRepo(r.fullName)}
                                  style={{
                                    display:"block", width:"100%", textAlign:"left",
                                    background:"transparent", border:"none", borderBottom:`1px solid ${VS.border}`,
                                    padding:"8px 12px", cursor:"pointer", color:VS.text,
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background="#2A2D2E")}
                                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                                >
                                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                                    <GitBranch size={11} color={r.private ? VS.warning : VS.success} style={{ flexShrink:0 }}/>
                                    <span style={{ fontSize:12, fontWeight:600, fontFamily:FONT_MONO, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                      {r.fullName}
                                    </span>
                                    {r.private && (
                                      <span style={{ fontSize:9, background:"#3C3C3C", color:VS.textMuted, padding:"1px 5px", borderRadius:10, flexShrink:0 }}>private</span>
                                    )}
                                  </div>
                                  {r.description && (
                                    <div style={{ fontSize:11, color:VS.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", paddingLeft:17 }}>
                                      {r.description}
                                    </div>
                                  )}
                                  {r.language && (
                                    <div style={{ fontSize:10, color:VS.textFaint, paddingLeft:17, marginTop:1 }}>{r.language}</div>
                                  )}
                                </button>
                              ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Connected: repo info + file tree ── */}
                    {gitRepo && (() => {
                      const tree = buildTree(gitRepo.files);
                      return (
                        <>
                          {/* Repo header */}
                          <div style={{ padding:"6px 10px 4px", borderBottom:`1px solid ${VS.border}`, flexShrink:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <GitBranch size={12} color={VS.accent}/>
                              <span style={{ fontSize:12, color:VS.textActive, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {gitRepo.fullName}
                              </span>
                              <a href={gitRepo.htmlUrl} target="_blank" rel="noreferrer"
                                style={{ color:VS.textMuted, display:"flex", alignItems:"center" }} title="Open on GitHub">
                                <ExternalLink size={11}/>
                              </a>
                            </div>
                            <div style={{ fontSize:10, color:VS.textMuted, marginTop:2 }}>
                              branch: <span style={{ color:VS.success }}>{gitRepo.branch}</span>
                              {" · "}{gitRepo.files.length} files
                            </div>
                          </div>

                          {/* ── "What changes?" prompt step ── */}
                          {gitShowPromptStep && (
                            <div style={{ margin:"8px 8px 0", padding:"10px", borderRadius:6, background:"rgba(0,122,204,0.08)", border:`1px solid rgba(0,122,204,0.3)` }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                                <Sparkles size={11} color={VS.accent}/>
                                <span style={{ fontSize:11, fontWeight:700, color:VS.text }}>What would you like to do?</span>
                                <button
                                  onClick={() => setGitShowPromptStep(false)}
                                  style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:VS.textMuted, padding:0 }}
                                >
                                  <X size={11}/>
                                </button>
                              </div>

                              {/* Import as Project — primary action */}
                              <button
                                onClick={importRepoAsProject}
                                disabled={gitImporting || gitAnalyzing}
                                style={{
                                  width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                                  padding:"9px", borderRadius:4, border:"none",
                                  background: VS.accent, color:"#fff",
                                  fontSize:12, fontWeight:700,
                                  cursor: (gitImporting || gitAnalyzing) ? "not-allowed" : "pointer",
                                  marginBottom:4, opacity: (gitImporting || gitAnalyzing) ? 0.6 : 1,
                                }}
                              >
                                {gitImporting
                                  ? <><Loader2 size={12} style={{ animation:"spin 1s linear infinite" }}/> Importing…</>
                                  : <><FolderOpen size={12}/> Import as Project</>}
                              </button>
                              <div style={{ fontSize:10, color:VS.textFaint, marginBottom:8, textAlign:"center" }}>
                                Saves repo files as a project — edit anything with AI
                              </div>

                              {/* Analyze with AI Agents — secondary action */}
                              <button
                                onClick={startAnalyzeRepo}
                                disabled={gitAnalyzing || gitImporting}
                                style={{
                                  width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                                  padding:"7px", borderRadius:4, border:`1px solid rgba(0,122,204,0.5)`,
                                  background:"rgba(0,122,204,0.10)", color: VS.accent,
                                  fontSize:11, fontWeight:600,
                                  cursor: (gitAnalyzing || gitImporting) ? "not-allowed" : "pointer",
                                  marginBottom:4, opacity: (gitAnalyzing || gitImporting) ? 0.6 : 1,
                                }}
                              >
                                {gitAnalyzing
                                  ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Analyzing…</>
                                  : <><Brain size={11}/> Analyze with AI Agents</>}
                              </button>
                              <div style={{ fontSize:10, color:VS.textFaint, marginBottom:8, textAlign:"center" }}>
                                7 agents generate a full code review report
                              </div>

                              <div style={{ borderTop:`1px solid ${VS.border}`, marginBottom:8 }}/>

                              <div style={{ fontSize:11, color:VS.textMuted, marginBottom:5, fontWeight:600 }}>Or make targeted changes:</div>
                              <textarea
                                value={gitChangePrompt}
                                onChange={e => setGitChangePrompt(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) {
                                    setGitInstruction(gitChangePrompt);
                                    setGitAiOpen(true);
                                    setGitShowPromptStep(false);
                                  }
                                }}
                                placeholder={`e.g. "Add dark mode toggle", "Fix the login bug", "Add TypeScript types"…`}
                                rows={3}
                                style={{
                                  width:"100%", background:"#3C3C3C", border:`1px solid ${VS.border}`,
                                  borderRadius:4, padding:"6px 8px", color:VS.text,
                                  fontSize:11, fontFamily:FONT_MONO, resize:"none", outline:"none",
                                  lineHeight:1.6, boxSizing:"border-box",
                                }}
                                onFocus={e => (e.target.style.borderColor=VS.accent)}
                                onBlur={e  => (e.target.style.borderColor=VS.border)}
                              />
                              <div style={{ display:"flex", gap:5, marginTop:6 }}>
                                <button
                                  onClick={() => {
                                    if (gitChangePrompt.trim()) {
                                      setGitInstruction(gitChangePrompt);
                                      setGitAiOpen(true);
                                    }
                                    setGitShowPromptStep(false);
                                  }}
                                  disabled={!gitChangePrompt.trim()}
                                  style={{
                                    flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                    padding:"6px", borderRadius:4, border:"none",
                                    background: gitChangePrompt.trim() ? VS.accent : "#3C3C3C",
                                    color:"#fff", fontSize:11, fontWeight:600,
                                    cursor: gitChangePrompt.trim() ? "pointer" : "not-allowed",
                                  }}
                                >
                                  <Sparkles size={11}/> Apply with AI
                                </button>
                                <button
                                  onClick={() => setGitShowPromptStep(false)}
                                  style={{
                                    padding:"6px 10px", borderRadius:4, border:`1px solid ${VS.border}`,
                                    background:"transparent", color:VS.textMuted, fontSize:11, cursor:"pointer",
                                  }}
                                >
                                  Browse files
                                </button>
                              </div>
                              <div style={{ fontSize:10, color:VS.textFaint, marginTop:5 }}>
                                Ctrl+Enter to confirm · Open a file in the tree, then AI Edit will apply your instruction
                              </div>
                            </div>
                          )}

                          {/* File tree */}
                          <div style={{ flex:1, overflowY:"auto" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", fontSize:12, color:VS.text, fontWeight:600 }}>
                              <ChevronDown size={13} color={VS.textMuted}/>
                              <FolderOpen size={13} color="#DCB67A"/>
                              <span>{gitRepo.repo}</span>
                            </div>
                            <TreeNode
                              name={gitRepo.repo}
                              node={tree}
                              depth={1}
                              onOpenFile={(f) => openGitFile(f.path)}
                              activeFilePath={activeTabPath}
                              expandedDirs={gitExpandedDirs}
                              toggleDir={toggleGitDir}
                            />
                            {gitLoadingFile && (
                              <div style={{ padding:"4px 10px", display:"flex", alignItems:"center", gap:6 }}>
                                <Loader2 size={11} color={VS.textMuted} style={{ animation:"spin 1s linear infinite" }}/>
                                <span style={{ fontSize:11, color:VS.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {gitLoadingFile.split("/").pop()}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* ── Bottom toolbar: AI edit + push ── */}
                          <div style={{ borderTop:`1px solid ${VS.border}`, flexShrink:0, padding:"8px 8px 6px" }}>

                            {/* Error */}
                            {gitError && (
                              <div style={{ marginBottom:6, padding:"5px 8px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:6, alignItems:"flex-start" }}>
                                <AlertTriangle size={11} color={VS.error} style={{ flexShrink:0, marginTop:1 }}/>
                                <span style={{ fontSize:11, color:VS.error, lineHeight:1.5, flex:1 }}>{gitError}</span>
                                <button onClick={() => setGitError("")} style={{ background:"none", border:"none", cursor:"pointer", color:VS.textMuted, padding:0, flexShrink:0 }}>
                                  <X size={10}/>
                                </button>
                              </div>
                            )}

                            {/* Push result */}
                            {gitPushResult && !gitPushResult.error && (
                              <div style={{ marginBottom:6, padding:"5px 8px", borderRadius:4, background:"rgba(78,201,148,0.08)", border:`1px solid rgba(78,201,148,0.25)`, display:"flex", gap:6, alignItems:"center" }}>
                                <CheckCircle2 size={11} color={VS.success}/>
                                <span style={{ fontSize:11, color:VS.success, flex:1 }}>Pushed!</span>
                                {gitPushResult.commitUrl && (
                                  <a href={gitPushResult.commitUrl} target="_blank" rel="noreferrer" style={{ color:VS.success }}>
                                    <ExternalLink size={11}/>
                                  </a>
                                )}
                                <button onClick={() => setGitPushResult(null)} style={{ background:"none", border:"none", cursor:"pointer", color:VS.textMuted, padding:0 }}>
                                  <X size={10}/>
                                </button>
                              </div>
                            )}

                            {/* Import / Analyze buttons (persistent, shown when AI edit panel is closed) */}
                            {!gitAiOpen && (
                              <div style={{ display:"flex", gap:5, marginBottom:6 }}>
                                <button
                                  onClick={importRepoAsProject}
                                  disabled={gitImporting || gitAnalyzing}
                                  style={{
                                    flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                    padding:"6px", borderRadius:4, border:"none",
                                    background: VS.accent, color:"#fff",
                                    fontSize:11, fontWeight:700,
                                    cursor: (gitImporting || gitAnalyzing) ? "not-allowed" : "pointer",
                                    opacity: (gitImporting || gitAnalyzing) ? 0.6 : 1,
                                  }}
                                >
                                  {gitImporting
                                    ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Importing…</>
                                    : <><FolderOpen size={11}/> Import as Project</>}
                                </button>
                                <button
                                  onClick={startAnalyzeRepo}
                                  disabled={gitAnalyzing || gitImporting}
                                  title="Analyze with AI Agents"
                                  style={{
                                    display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                    padding:"6px 8px", borderRadius:4, border:`1px solid rgba(0,122,204,0.4)`,
                                    background:"rgba(0,122,204,0.1)", color: VS.accent,
                                    fontSize:11, fontWeight:600,
                                    cursor: (gitAnalyzing || gitImporting) ? "not-allowed" : "pointer",
                                    opacity: (gitAnalyzing || gitImporting) ? 0.6 : 1,
                                  }}
                                >
                                  {gitAnalyzing
                                    ? <Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/>
                                    : <Brain size={11}/>}
                                </button>
                              </div>
                            )}

                            {/* AI Edit section */}
                            {gitAiOpen && (
                              <div style={{ marginBottom:6 }}>
                                <textarea
                                  value={gitInstruction}
                                  onChange={e => setGitInstruction(e.target.value)}
                                  onKeyDown={e => { if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) runGitAiEdit(); }}
                                  placeholder={`Describe what to change in ${activeTabPath?.split("/").pop() || "this file"}…`}
                                  rows={3}
                                  style={{
                                    width:"100%", background:"#3C3C3C", border:`1px solid ${VS.border}`,
                                    borderRadius:4, padding:"6px 8px", color:VS.text,
                                    fontSize:11, fontFamily:FONT_MONO, resize:"none", outline:"none",
                                    lineHeight:1.6,
                                  }}
                                  onFocus={e => (e.target.style.borderColor=VS.accent)}
                                  onBlur={e  => (e.target.style.borderColor=VS.border)}
                                  autoFocus
                                />
                                <div style={{ display:"flex", gap:5, marginTop:4 }}>
                                  <button
                                    onClick={runGitAiEdit}
                                    disabled={gitAiEditing || !gitInstruction.trim() || !activeTabPath}
                                    style={{
                                      flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                      padding:"5px", borderRadius:4, border:"none",
                                      background: gitInstruction.trim() && activeTabPath ? VS.accent : "#3C3C3C",
                                      color:"#fff", fontSize:11, fontWeight:600, cursor:"pointer",
                                    }}
                                  >
                                    {gitAiEditing
                                      ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Editing…</>
                                      : <><Sparkles size={11}/> Apply</>}
                                  </button>
                                  <button onClick={() => { setGitAiOpen(false); setGitInstruction(""); }}
                                    style={{ padding:"5px 8px", borderRadius:4, border:`1px solid ${VS.border}`, background:"transparent", color:VS.textMuted, fontSize:11, cursor:"pointer" }}>
                                    Cancel
                                  </button>
                                </div>
                                <div style={{ fontSize:10, color:VS.textFaint, marginTop:3 }}>Ctrl+Enter to apply</div>
                              </div>
                            )}

                            {/* Commit message (shown when pushing) */}
                            {!gitAiOpen && (
                              <input
                                value={gitPushMsg}
                                onChange={e => setGitPushMsg(e.target.value)}
                                placeholder="Commit message (optional)"
                                style={{
                                  width:"100%", marginBottom:6, background:"#3C3C3C",
                                  border:`1px solid ${VS.border}`, borderRadius:4,
                                  padding:"5px 8px", color:VS.text, fontSize:11,
                                  outline:"none", fontFamily:FONT_UI,
                                }}
                                onFocus={e => (e.target.style.borderColor=VS.accent)}
                                onBlur={e  => (e.target.style.borderColor=VS.border)}
                              />
                            )}

                            {/* Action buttons */}
                            <div style={{ display:"flex", gap:5 }}>
                              <button
                                onClick={() => { setGitAiOpen(p => !p); setGitError(""); }}
                                disabled={!activeTabPath}
                                title={activeTabPath ? "AI-edit current file" : "Open a file first"}
                                style={{
                                  flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                  padding:"6px", borderRadius:4, border:`1px solid ${VS.border}`,
                                  background: gitAiOpen ? "#3C3C3C" : "transparent",
                                  color: activeTabPath ? VS.text : VS.textFaint,
                                  fontSize:11, fontWeight:500, cursor: activeTabPath ? "pointer" : "not-allowed",
                                }}
                              >
                                <Sparkles size={11} color={activeTabPath ? VS.agentColors.Frontend : VS.textFaint}/>
                                AI Edit
                              </button>
                              <button
                                onClick={pushGitFile}
                                disabled={gitPushing || !activeTabPath}
                                title={activeTabPath ? `Push ${activeTabPath} to GitHub` : "Open a file first"}
                                style={{
                                  flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                  padding:"6px", borderRadius:4, border:"none",
                                  background: activeTabPath && !gitPushing ? "#238636" : "#3C3C3C",
                                  color:"#fff", fontSize:11, fontWeight:600,
                                  cursor: activeTabPath && !gitPushing ? "pointer" : "not-allowed",
                                }}
                              >
                                {gitPushing
                                  ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Pushing…</>
                                  : <><Upload size={11}/> Push</>}
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Panel: Projects */}
              {activity === "projects" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    PROJECTS
                  </div>
                  <div style={{ flex:1, overflowY:"auto" }}>
                    {recentBuilds.length === 0 ? (
                      <div style={{ padding:"20px 16px", fontSize:12, color:VS.textFaint, lineHeight:1.6 }}>
                        No builds yet. Start a build in the AI Agents panel.
                      </div>
                    ) : recentBuilds.map(build => {
                      const isExpanded = expandedProjects.has(build._id);
                      const isLoading  = loadingProjectId === build._id;
                      const files      = projectFilesMap[build._id] || [];
                      const statusColor = build.status === "complete" ? VS.success
                        : build.status === "failed" ? VS.error : VS.textMuted;

                      return (
                        <React.Fragment key={build._id}>
                          {/* Build row */}
                          <div
                            className="tree-item"
                            onClick={() => toggleProject(build._id)}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px 5px 10px", cursor:"pointer", userSelect:"none" }}
                            onMouseEnter={e => e.currentTarget.querySelector(".del-btn")?.style && (e.currentTarget.querySelector(".del-btn").style.opacity="1")}
                            onMouseLeave={e => e.currentTarget.querySelector(".del-btn")?.style && (e.currentTarget.querySelector(".del-btn").style.opacity="0")}
                          >
                            {isExpanded
                              ? <ChevronDown  size={12} color={VS.textMuted}/>
                              : <ChevronRight size={12} color={VS.textMuted}/>}
                            {isExpanded
                              ? <FolderOpen size={14} color="#DCB67A"/>
                              : <Folder     size={14} color="#DCB67A"/>}
                            <span style={{ fontSize:12, color:VS.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {build.description}
                            </span>
                            {isLoading
                              ? <Loader2 size={11} color={VS.textMuted} style={{ animation:"spin 1s linear infinite", flexShrink:0 }}/>
                              : <span style={{ fontSize:10, color:statusColor, flexShrink:0, fontWeight:500 }}>{build.status}</span>
                            }
                            <button
                              className="del-btn"
                              onClick={e => deleteProject(build._id, e)}
                              title="Delete project"
                              style={{
                                opacity:0, transition:"opacity 0.15s",
                                width:20, height:20, borderRadius:4,
                                background:"transparent", border:"none",
                                color:VS.error, cursor:"pointer", flexShrink:0,
                                display:"flex", alignItems:"center", justifyContent:"center",
                                padding:0,
                              }}
                              onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background="rgba(244,135,113,0.15)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background="transparent"; }}
                            >
                              <Trash2 size={11}/>
                            </button>
                          </div>

                          {/* File list */}
                          {isExpanded && !isLoading && (
                            files.length === 0
                              ? <div style={{ paddingLeft:36, paddingBottom:4, fontSize:11, color:VS.textFaint }}>No files.</div>
                              : (() => {
                                  // Group files by agent
                                  const byAgent = {};
                                  files.forEach(f => {
                                    if (!byAgent[f.agent]) byAgent[f.agent] = [];
                                    byAgent[f.agent].push(f);
                                  });
                                  return Object.entries(byAgent).map(([agentName, agentFiles]) => {
                                    const meta     = AGENT_META.find(a => a.name === agentName);
                                    const AgIcon   = meta?.Icon || FileText;
                                    const agColor  = meta?.color || VS.textMuted;
                                    const groupKey = `proj:${build._id}:${agentName}`;
                                    const open     = expandedDirs.has(groupKey);
                                    return (
                                      <React.Fragment key={agentName}>
                                        {/* Agent group header */}
                                        <div
                                          className="tree-item"
                                          onClick={() => toggleDir(groupKey)}
                                          style={{ display:"flex", alignItems:"center", gap:5, paddingLeft:24, height:22, cursor:"pointer", userSelect:"none" }}
                                        >
                                          {open ? <ChevronDown size={11} color={VS.textMuted}/> : <ChevronRight size={11} color={VS.textMuted}/>}
                                          <AgIcon size={12} color={agColor}/>
                                          <span style={{ fontSize:11, color:VS.textMuted, fontWeight:500 }}>{agentName}</span>
                                          <span style={{ fontSize:10, color:VS.textFaint, marginLeft:"auto", paddingRight:8 }}>{agentFiles.length}</span>
                                        </div>
                                        {/* Files */}
                                        {open && agentFiles.map(f => (
                                          <div
                                            key={f.path}
                                            className="tree-item"
                                            onClick={() => openFile(f)}
                                            style={{
                                              display:"flex", alignItems:"center", gap:6,
                                              paddingLeft:40, height:22, cursor:"pointer",
                                              background: activeTabPath === f.path ? "#37373D" : "transparent",
                                            }}
                                          >
                                            <FileIcon path={f.path} size={13}/>
                                            <span style={{
                                              fontSize:12, color: activeTabPath === f.path ? VS.textActive : VS.text,
                                              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                                            }}>
                                              {f.path.split("/").pop()}
                                            </span>
                                          </div>
                                        ))}
                                      </React.Fragment>
                                    );
                                  });
                                })()
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </>
              )}
              {/* ── Persistent chat input bar — Replit-style ─────────── */}
              <div style={{
                flexShrink:0, padding:"10px 12px 12px",
                background: VS.sideBar,
              }}>
                {/* Outer card */}
                <div
                  style={{
                    background:"#2A2A2A",
                    border:`1.5px solid rgba(255,255,255,0.09)`,
                    borderRadius:16,
                    padding:"10px 10px 8px 14px",
                    transition:"border-color 0.2s, box-shadow 0.2s",
                    boxShadow:"0 2px 12px rgba(0,0,0,0.25)",
                  }}
                  onFocusCapture={e => {
                    const el = e.currentTarget;
                    el.style.borderColor = "rgba(0,120,212,0.55)";
                    el.style.boxShadow = "0 0 0 3px rgba(0,120,212,0.12), 0 2px 12px rgba(0,0,0,0.25)";
                  }}
                  onBlurCapture={e => {
                    const el = e.currentTarget;
                    el.style.borderColor = "rgba(255,255,255,0.09)";
                    el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.25)";
                  }}
                >
                  {/* Textarea row */}
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={e => {
                      setChatInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (phase !== "building") sendChatMessage();
                      }
                    }}
                    placeholder={
                      phase === "building"
                        ? "Agents are working…"
                        : editingFiles
                        ? "Editing files…"
                        : aiThinking
                        ? "AI is thinking…"
                        : "Ask anything, describe an app, or request a change…"
                    }
                    disabled={phase === "building" || editingFiles || aiThinking}
                    rows={2}
                    style={{
                      display:"block", width:"100%",
                      background:"transparent", border:"none", outline:"none",
                      color: phase === "building" ? VS.textFaint : VS.textActive,
                      fontSize:13, fontFamily:FONT_UI, resize:"none",
                      lineHeight:1.55, minHeight:38, maxHeight:140,
                      cursor: phase === "building" ? "not-allowed" : "text",
                      marginBottom:6,
                    }}
                  />
                  {/* Bottom action row */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    {/* New Project button (when files exist) or decorative + */}
                    {allFiles.length > 0 ? (
                      <button
                        onClick={reset}
                        title="Start a new project"
                        style={{
                          display:"flex", alignItems:"center", gap:5,
                          padding:"3px 10px", borderRadius:20,
                          background:"transparent",
                          border:"1.5px solid rgba(255,255,255,0.12)",
                          color:VS.textMuted, fontSize:11, fontFamily:FONT_UI,
                          cursor:"pointer", transition:"all 0.15s", flexShrink:0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.3)"; e.currentTarget.style.color=VS.text; }}
                        onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.color=VS.textMuted; }}
                      >
                        <Plus size={11}/> New project
                      </button>
                    ) : (
                      <button
                        title="New project"
                        style={{
                          width:28, height:28, borderRadius:"50%",
                          background:"transparent",
                          border:"1.5px solid rgba(255,255,255,0.12)",
                          color:VS.textMuted,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          cursor:"pointer", transition:"all 0.15s", flexShrink:0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.25)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; }}
                      >
                        <Plus size={14}/>
                      </button>
                    )}

                    {/* Send button — round, filled */}
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim() || phase === "building" || editingFiles || aiThinking}
                      title="Send (Enter)"
                      style={{
                        width:30, height:30, borderRadius:"50%", border:"none",
                        background: chatInput.trim() && phase !== "building"
                          ? "linear-gradient(135deg,#0078D4,#1a94ff)"
                          : "rgba(255,255,255,0.07)",
                        color: chatInput.trim() && phase !== "building" ? "#fff" : VS.textFaint,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        cursor: chatInput.trim() && phase !== "building" ? "pointer" : "not-allowed",
                        transition:"all 0.15s",
                        boxShadow: chatInput.trim() && phase !== "building"
                          ? "0 2px 8px rgba(0,120,212,0.4)"
                          : "none",
                      }}
                      onMouseEnter={e => { if (chatInput.trim() && phase !== "building") e.currentTarget.style.transform = "scale(1.08)"; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                    >
                      <Send size={13}/>
                    </button>
                  </div>
                </div>
              </div>

              </React.Fragment>
            );

            /* editor inner content — shared by mobile & desktop Panel */
            const editorContent = activity === "home" ? (
              <div style={{ flex:1, overflowY:"auto", background:"#1b1b1c", color:VS.text, fontFamily:FONT_UI }}>
                <div style={{ width:"100%", maxWidth:980, margin:"0 auto", padding:isMobile ? "28px 16px 44px" : "52px 28px 70px", boxSizing:"border-box" }}>
                  <div style={{ textAlign:"center", marginBottom:24 }}>
                    <div style={{ color:VS.textActive, fontSize:isMobile ? 25 : 32, fontWeight:650, letterSpacing:"-0.035em" }}>What do you want to build?</div>
                    <div style={{ color:VS.textMuted, fontSize:12, marginTop:8 }}>Describe an idea and Firebox will turn it into a real project.</div>
                  </div>

                  <div style={{ border:`1px solid ${VS.border}`, borderRadius:10, background:"transparent", padding:"12px 13px 9px", margin:"0 auto 28px", maxWidth:800 }}>
                    <textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={e => { setChatInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,130)+"px"; }}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (phase !== "building") sendChatMessage(); } }}
                      placeholder="Describe what you want to create..."
                      rows={2}
                      style={{ width:"100%", minHeight:46, maxHeight:130, resize:"none", display:"block", background:"transparent", border:"none", outline:"none", color:VS.textActive, fontFamily:FONT_UI, fontSize:14, lineHeight:1.55 }}
                    />
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginTop:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, color:VS.textMuted, fontSize:11 }}>
                        <button onClick={() => { setActivity("agents"); setSideOpen(true); }} title="Open AI Agents" style={{ width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${VS.border}`, borderRadius:6, background:"transparent", color:VS.textMuted, cursor:"pointer" }}><Plus size={14}/></button>
                        <span style={{ padding:"6px 9px", border:`1px solid ${VS.border}`, borderRadius:6, color:VS.textMuted }}>{aiProvider === "cloud" ? "Cloud AI" : "Local AI"}</span>
                        <span style={{ display:isMobile ? "none" : "inline", color:VS.textFaint }}>Enter to build · Shift+Enter for a new line</span>
                      </div>
                      <button onClick={sendChatMessage} disabled={!chatInput.trim() || phase === "building" || aiThinking} title="Start building" style={{ width:34, height:34, borderRadius:8, border:"none", display:"flex", alignItems:"center", justifyContent:"center",                         background:"transparent", color:chatInput.trim() ? VS.text : VS.textFaint, cursor:chatInput.trim() ? "pointer" : "not-allowed" }}><Send size={15}/></button>
                    </div>
                  </div>

                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:isMobile ? 10 : 22, flexWrap:"wrap", marginBottom:26 }}>
                    {[[Globe,"Website","Build a web app"],[Code2,"Mobile","Build a mobile app"],[Package,"Dashboard","Create a dashboard"],[Server,"API","Create a backend"],[Sparkles,"Landing page","Design a landing page"]].map(([Icon,label,prompt]) => (
                      <button key={label} onClick={() => { setChatInput(prompt); setActivity("agents"); setSideOpen(true); setTimeout(() => chatInputRef.current?.focus(), 80); }} style={{ minWidth:82, display:"flex", flexDirection:"column", alignItems:"center", gap:7, border:"none", background:"transparent", color:VS.textMuted, cursor:"pointer", fontFamily:FONT_UI }}>
                        <span style={{ width:48, height:48, border:`1px solid ${VS.border}`, borderRadius:13, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(255,255,255,0.035)" }}><Icon size={19}/></span>
                        <span style={{ fontSize:11 }}>{label}</span>
                      </button>
                    ))}
                  </div>


                </div>
              </div>
            ) : activity === "workspace" ? (
              <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", background:"#181818", color:VS.text, fontFamily:FONT_UI }}>
                <div style={{ height:52, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px", borderBottom:`1px solid ${VS.border}`, background:"#202020" }}>
                  <div><div style={{ color:VS.textActive, fontSize:18, fontWeight:700 }}>My Workspace</div><div style={{ color:VS.textMuted, fontSize:11, marginTop:3 }}>{workflowStage?.activity || "Follow your agents and inspect generated project files."}</div></div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, color:VS.textMuted, fontSize:11 }}><span style={{ width:7, height:7, borderRadius:"50%", background:phase === "error" ? VS.error : phase === "complete" ? VS.success : VS.accent }}/>{phase === "idle" ? "Ready" : phase === "building" ? "Agents working" : phase === "complete" ? "Complete" : "Needs attention"}{phase === "building" && <button onClick={stopBuild} style={{ marginLeft:6, border:`1px solid ${VS.error}66`, borderRadius:6, background:`${VS.error}12`, color:VS.error, padding:"4px 8px", fontSize:10, cursor:"pointer" }}>Stop Agent</button>}</div>
                </div>
                {(planning || buildPlan) && <div style={{ flexShrink:0, margin:"10px 14px 0", padding:"12px 14px", border:`1px solid ${VS.accent}66`, borderRadius:9, background:`${VS.accent}0d` }}><div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:8 }}><div style={{ color:VS.textActive, fontSize:12, fontWeight:700 }}>🔥 Firebox Agent plan</div>{planning ? <span style={{ color:VS.accent, fontSize:10 }}>Understanding your request…</span> : <button onClick={() => setBuildPlan(null)} style={{ border:"none", background:"transparent", color:VS.textMuted, cursor:"pointer", fontSize:11 }}>Cancel</button>}</div>{planning ? <div style={{ color:VS.textMuted, fontSize:11 }}>I’ll inspect the request and prepare the build steps before changing the project.</div> : <><div style={{ color:VS.text, fontSize:12, lineHeight:1.5, marginBottom:8 }}>{buildPlan.summary}</div><ol style={{ margin:"0 0 10px 18px", padding:0, color:VS.textMuted, fontSize:11, lineHeight:1.6 }}>{buildPlan.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>{buildPlan.needsConfirmation ? <><div style={{ padding:"8px 10px", borderRadius:7, background:`${VS.warning || "#d7ba7d"}18`, color:VS.textMuted, fontSize:11, marginBottom:8 }}>Confirmation required: {buildPlan.confirmationReason}</div><button onClick={() => confirmBuildPlan(true)} style={{ border:"none", borderRadius:7, background:VS.accent, color:"white", padding:"8px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Confirm and start building →</button></> : <button onClick={() => confirmBuildPlan(false)} style={{ border:"none", borderRadius:7, background:VS.accent, color:"white", padding:"8px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Start building →</button>}</>}</div>}
                <div style={{ flex:1, minHeight:0, display:"grid", gridTemplateColumns:isMobile ? "1fr" : "minmax(250px, 0.34fr) minmax(0, 0.66fr)", gap:0 }}>
                  <div style={{ minHeight:0, display:"flex", flexDirection:"column", borderRight:isMobile ? "none" : `1px solid ${VS.border}`, background:"#252526" }}>
                    <div style={{ padding:"12px 12px 7px", color:VS.textMuted, fontSize:10, fontWeight:800, letterSpacing:"0.1em" }}>EXPLORER</div>
                    <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"0 8px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, height:28, color:VS.text, fontSize:12, fontWeight:700 }}><ChevronDown size={13} color={VS.textMuted}/><Zap size={13} color={VS.accent}/><span>firebox-project</span></div>
                      {allFiles.length === 0 ? <div style={{ padding:"12px 20px", color:VS.textFaint, fontSize:11, lineHeight:1.5 }}>Files created by the agents will appear here.</div> : AGENT_META.map(({ name:agentName, Icon, color }) => { const agentFiles = filesByAgent[agentName] || []; if (!agentFiles.length) return null; const groupKey = `agent:${agentName}`; const isOpen = expandedDirs.has(groupKey); const tree = buildTree(agentFiles); return <React.Fragment key={agentName}><div onClick={() => toggleDir(groupKey)} style={{ display:"flex", alignItems:"center", gap:6, height:25, paddingLeft:5, cursor:"pointer", color:VS.textMuted, fontSize:11 }}>{isOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<Icon size={13} color={color}/><span>{agentName}</span><span style={{ marginLeft:"auto", color:VS.textFaint, paddingRight:6 }}>{agentFiles.length}</span></div>{isOpen && <TreeNode name={agentName} node={tree} depth={1} onOpenFile={openFile} activeFilePath={activeTabPath} expandedDirs={expandedDirs} toggleDir={toggleDir}/>}</React.Fragment>; })}
                    </div>
                    <div style={{ flexShrink:0, padding:"10px 10px 12px", borderTop:`1px solid ${VS.border}`, background:"#202020" }}>
                      <textarea ref={chatInputRef} value={chatInput} onChange={e => { setChatInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,85)+"px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (phase !== "building") sendChatMessage(); } }} placeholder="Ask anything, describe an app, or request a change…" rows={2} style={{ width:"100%", boxSizing:"border-box", minHeight:52, maxHeight:85, resize:"none", padding:"9px 10px", border:`1px solid ${VS.borderLight}`, borderRadius:8, background:"#181818", color:VS.textActive, fontFamily:FONT_UI, fontSize:11, lineHeight:1.45, outline:"none" }}/>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}><button onClick={() => { setChatInput(""); setTimeout(() => chatInputRef.current?.focus(), 0); }} style={{ border:`1px solid ${VS.border}`, borderRadius:999, background:"transparent", color:VS.textMuted, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>＋ New project</button><button onClick={sendChatMessage} disabled={!chatInput.trim() || phase === "building" || aiThinking} title="Build" style={{ width:28, height:28, border:"none", borderRadius:7, background:chatInput.trim() ? VS.accent : "#38383a", color:chatInput.trim() ? "#fff" : VS.textFaint, display:"flex", alignItems:"center", justifyContent:"center", cursor:chatInput.trim() ? "pointer" : "not-allowed" }}><Send size={13}/></button></div>
                    </div>
                  </div>
                  <div style={{ minWidth:0, minHeight:0, display:"flex", flexDirection:"column", background:"#1e1e1e" }}>
                    <div style={{ height:36, flexShrink:0, display:"flex", alignItems:"stretch", overflowX:"auto", borderBottom:`1px solid ${VS.border}`, background:VS.tabBar }}>
                      {openTabs.length === 0 ? <div style={{ display:"flex", alignItems:"center", padding:"0 12px", color:VS.textFaint, fontSize:11 }}>No project file selected</div> : openTabs.map(tab => { const isActive = tab.path === activeTabPath; return <button key={tab.path} onClick={() => setActiveTabPath(tab.path)} style={{ display:"flex", alignItems:"center", gap:6, minWidth:110, maxWidth:190, padding:"0 10px", border:"none", borderRight:`1px solid ${VS.border}`, borderTop:`2px solid ${isActive ? VS.accent : "transparent"}`, background:isActive ? VS.activeTab : VS.inactiveTab, color:isActive ? VS.textActive : VS.textMuted, fontFamily:FONT_UI, fontSize:11, cursor:"pointer" }}><FileIcon path={tab.path} size={13}/><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tab.path.split("/").pop()}</span></button>; })}
                    </div>
                    <div style={{ flex:1, minHeight:220 }}>{activeTabPath ? <MonacoEditor height="100%" language={getMonacoLang(activeTabPath)} theme="vs-dark" value={activeContent} onChange={value => { if (activeTabPath) setTabContents(prev => ({ ...prev, [activeTabPath]: value ?? "" })); }} options={{ minimap:{ enabled:false }, fontSize:13, automaticLayout:true, wordWrap:"on", padding:{ top:12 } }} /> : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:VS.textFaint, fontSize:12 }}>Generated files will appear here after an agent opens a project file.</div>}</div>
                  </div>
                </div>
              </div>
            ) : activity === "agents" ? (
              <div style={{ flex:1, overflowY:"auto", background:"#1b1b1c", color:VS.text, fontFamily:FONT_UI }}>
                <div style={{ width:"100%", margin:0, padding:isMobile ? "24px 16px 44px" : "30px 20px 58px", boxSizing:"border-box" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:20, marginBottom:28 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, color:VS.accent, fontSize:11, fontWeight:700, letterSpacing:"0.12em", marginBottom:9 }}><Cpu size={14}/> AI AGENTS</div>
                      <h1 style={{ margin:0, color:VS.textActive, fontSize:isMobile ? 26 : 34, letterSpacing:"-0.035em", fontWeight:700 }}>Choose your AI engine</h1>
                      <p style={{ margin:"9px 0 0", color:VS.textMuted, fontSize:13, lineHeight:1.65 }}>Select the AI provider that will power your Firebox Agent.<br/>Your agent can handle the complete development workflow.</p>
                    </div>
                    <div style={{ display:isMobile ? "none" : "flex", alignItems:"center", gap:8, padding:"8px 11px", border:`1px solid ${VS.border}`, borderRadius:8, color:VS.textMuted, fontSize:11 }}>
                      <span style={{ width:7, height:7, borderRadius:"50%", background:phase === "error" ? VS.error : phase === "complete" ? VS.success : VS.accent, boxShadow:`0 0 8px ${phase === "error" ? VS.error : VS.accent}` }}/>{phase === "idle" ? "Ready" : phase === "building" ? "Pipeline running" : phase === "complete" ? "Build complete" : "Needs attention"}
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap:14, marginBottom:24 }}>
                    {AI_PROVIDER_CARDS.map(({ id, Icon, title, subtitle, description, color, action, enabled }) => {
                      const selected = aiProvider === id;
                      const handleSelect = () => {
                        if (!enabled) { setErrorMsg(`${title} provider is not enabled yet. Cloud AI and Local AI remain available.`); return; }
                        setErrorMsg("");
                        if (id === "local") { setAiProvider("local"); setLocalAiTestState("idle"); setLocalAiTestMessage(""); setActivity("settings"); setSideOpen(true); }
                        else { setAiProvider("cloud"); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }
                      };
                      return (
                        <div key={id} style={{ position:"relative", minHeight:245, display:"flex", flexDirection:"column", padding:18, border:`1px solid ${selected ? VS.accent : VS.border}`, borderRadius:12, background:selected ? "linear-gradient(180deg, rgba(0,120,212,0.10), rgba(255,255,255,0.025))" : "rgba(255,255,255,0.025)", boxShadow:selected ? `0 0 0 1px ${VS.accent}44, 0 16px 40px rgba(0,0,0,0.18)` : "none" }}>
                          {selected && <span style={{ position:"absolute", top:14, right:14, padding:"5px 8px", borderRadius:999, background:"rgba(0,120,212,0.22)", color:VS.accent, fontSize:9, fontWeight:800, letterSpacing:"0.08em" }}>SELECTED</span>}
                          <div style={{ width:64, height:64, margin:"4px auto 15px", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:16, background:`${color}22`, color, boxShadow:`inset 0 0 0 1px ${color}55` }}><Icon size={32} strokeWidth={1.8}/></div>
                          <div style={{ textAlign:"center", color:VS.textActive, fontSize:18, fontWeight:700, letterSpacing:"-0.02em" }}>{title}</div>
                          <div style={{ textAlign:"center", color, fontSize:12, fontWeight:600, marginTop:6 }}>{subtitle}</div>
                          <div style={{ flex:1, textAlign:"center", color:VS.textMuted, fontSize:12, lineHeight:1.5, margin:"10px 8px 15px" }}>{description}</div>
                          <button onClick={handleSelect} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 12px", border:`1px solid ${selected ? VS.accent : VS.borderLight}`, borderRadius:8, background:selected ? "rgba(0,120,212,0.14)" : "transparent", color:selected ? VS.accent : enabled ? color : VS.textMuted, cursor:enabled ? "pointer" : "not-allowed", fontFamily:FONT_UI, fontSize:12, fontWeight:700 }}>
                            {selected ? <Check size={15}/> : <span>{action}</span>}{!selected && enabled && <ChevronRight size={15}/>} {selected && <span>Selected</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(4, 1fr)", gap:10, marginBottom:22 }}>
                    {[
                      ["AGENTS", AGENT_META.length],
                      ["COMPLETED", doneCount],
                      ["PROGRESS", `${Math.round(progress)}%`],
                      ["PROVIDER", aiProvider === "cloud" ? "CLOUD" : "LOCAL"],
                    ].map(([label,value]) => (
                      <div key={label} style={{ padding:"13px 14px", border:`1px solid ${VS.border}`, borderRadius:9, background:"rgba(255,255,255,0.025)" }}>
                        <div style={{ color:VS.textFaint, fontSize:9, fontWeight:700, letterSpacing:"0.1em", marginBottom:7 }}>{label}</div>
                        <div style={{ color:VS.textActive, fontSize:17, fontWeight:700 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.1fr 0.9fr", gap:16, alignItems:"start" }}>
                    <div style={{ border:`1px solid ${VS.border}`, borderRadius:12, background:"#222223", overflow:"hidden" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 15px", borderBottom:`1px solid ${VS.border}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, color:VS.textActive, fontSize:12, fontWeight:700 }}><Workflow size={15} color={VS.accent}/> Agent pipeline</div>
                        <span style={{ color:phase === "complete" ? VS.success : VS.textMuted, fontSize:10 }}>{doneCount}/{AGENT_META.length}</span>
                      </div>
                      <div style={{ height:3, background:"rgba(255,255,255,0.06)" }}><div style={{ height:"100%", width:`${progress}%`, background:phase === "complete" ? VS.success : VS.accent, transition:"width .3s ease" }}/></div>
                      <div style={{ padding:10 }}>
                        {AGENT_META.map(({name:agentName, Icon, color}) => {
                          const state = agentStates.find(a => a.name === agentName);
                          const status = state?.status || "pending";
                          const active = activeAgent === agentName || status === "running";
                          return (
                            <div key={agentName} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 9px", borderRadius:8, background:active ? "rgba(0,120,212,0.09)" : "transparent", marginBottom:3 }}>
                              <span style={{ width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", background:`${color}18`, color, flexShrink:0 }}><Icon size={15}/></span>
                              <div style={{ flex:1, minWidth:0 }}><div style={{ color:VS.textActive, fontSize:12, fontWeight:active || status === "done" ? 650 : 500 }}>{agentName}</div><div style={{ color:VS.textFaint, fontSize:10, marginTop:2 }}>{active ? "Working now…" : status === "done" ? "Completed" : status === "error" ? "Needs attention" : "Waiting"}</div></div>
                              <span style={{ fontSize:10, color:active ? VS.accent : status === "done" ? VS.success : status === "error" ? VS.error : VS.textFaint }}>{active ? "●" : status === "done" ? "✓" : "○"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ border:`1px solid ${VS.border}`, borderRadius:12, background:"#222223", overflow:"hidden", minHeight:300, display:"flex", flexDirection:"column" }}>
                      <div style={{ padding:"13px 15px", borderBottom:`1px solid ${VS.border}`, color:VS.textActive, fontSize:12, fontWeight:700 }}>Conversation</div>
                      <div style={{ flex:1, maxHeight:330, overflowY:"auto", padding:12 }}>
                        {chatHistory.length === 0 ? <div style={{ padding:"28px 10px", color:VS.textMuted, fontSize:12, lineHeight:1.6, textAlign:"center" }}>Tell the agents what you want to build. Your request and pipeline updates will appear here.</div> : chatHistory.slice(-8).map((msg,i) => <div key={i} style={{ display:"flex", justifyContent:msg.role === "user" ? "flex-end" : "flex-start", marginBottom:8 }}><div style={{ maxWidth:"92%", padding:"8px 10px", borderRadius:msg.role === "user" ? "9px 9px 2px 9px" : "9px 9px 9px 2px", background:msg.role === "user" ? VS.accent : "rgba(255,255,255,0.06)", color:msg.role === "user" ? "#fff" : VS.text, fontSize:11, lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{msg.text}</div></div>)}
                      </div>
                      <div style={{ padding:10, borderTop:`1px solid ${VS.border}` }}>
                        <div style={{ display:"flex", gap:7, alignItems:"flex-end", border:`1px solid ${VS.border}`, borderRadius:8, padding:"7px 8px", background:"#1c1c1d" }}>
                          <textarea ref={chatInputRef} value={chatInput} onChange={e => { setChatInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (phase !== "building") sendChatMessage(); } }} placeholder="Describe an app to build…" rows={1} style={{ flex:1, minHeight:28, maxHeight:100, resize:"none", border:"none", outline:"none", background:"transparent", color:VS.textActive, fontFamily:FONT_UI, fontSize:12, lineHeight:1.45 }}/><button onClick={sendChatMessage} disabled={!chatInput.trim() || phase === "building" || aiThinking} title="Send to agents" style={{ width:30, height:30, borderRadius:6, border:"none", background:chatInput.trim() ? VS.accent : "#38383a", color:chatInput.trim() ? "#fff" : VS.textFaint, display:"flex", alignItems:"center", justifyContent:"center", cursor:chatInput.trim() ? "pointer" : "not-allowed" }}><Send size={14}/></button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {errorMsg && <div style={{ marginTop:14, padding:"10px 12px", border:`1px solid ${VS.error}55`, borderRadius:8, color:VS.error, background:`${VS.error}12`, fontSize:11 }}>{errorMsg}</div>}
                </div>
              </div>
            ) : (
              <React.Fragment>

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

              {/* Preview toggle button */}
              {activeFile && (
                <button
                  onClick={() => setPreviewOpen(p => !p)}
                  title={previewOpen ? "Close preview" : "Open live preview"}
                  style={{
                    display:"flex", alignItems:"center", gap:5,
                    padding:"0 12px", height:"100%", flexShrink:0,
                    background: previewOpen ? "rgba(0,122,204,0.15)" : "transparent",
                    border:"none", borderLeft:`1px solid ${VS.border}`,
                    color: previewOpen ? VS.accent : VS.textMuted,
                    fontSize:11, fontWeight:600, cursor:"pointer",
                    transition:"color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => { if (!previewOpen) e.currentTarget.style.color=VS.text; }}
                  onMouseLeave={e => { if (!previewOpen) e.currentTarget.style.color=VS.textMuted; }}
                >
                  {previewOpen ? <EyeOff size={13}/> : <Eye size={13}/>}
                  {!isMobile && (previewOpen ? " Close Preview" : " Preview")}
                </button>
              )}
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

            {/* Monaco editor + optional preview split */}
            <div style={{ flex:1, overflow:"hidden", display:"flex" }}>

              {/* Monaco editor pane */}
              <div style={{ flex: previewOpen && previewContent ? "0 0 50%" : 1, overflow:"hidden", position:"relative", minWidth:0 }}>
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
                    minimap:              { enabled: !isMobile, scale: 1 },
                    lineNumbers:          isMobile ? "off" : "on",
                    folding:              true,
                    foldingHighlight:     true,
                    wordWrap:             isMobile ? "on" : "off",
                    fontSize:             isMobile ? 12 : 13,
                    fontFamily:           FONT_MONO,
                    fontLigatures:        !isMobile,
                    lineHeight:           isMobile ? 20 : 22,
                    renderLineHighlight:  "all",
                    scrollBeyondLastLine: false,
                    smoothScrolling:      true,
                    cursorBlinking:       "smooth",
                    cursorStyle:          "line",
                    automaticLayout:      true,
                    tabSize:              2,
                    insertSpaces:         true,
                    bracketPairColorization: { enabled: true },
                    guides:               { bracketPairs: "active", indentation: !isMobile },
                    scrollbar: {
                      vertical:              "visible",
                      horizontal:            isMobile ? "hidden" : "visible",
                      useShadows:            false,
                      verticalScrollbarSize: isMobile ? 4 : 10,
                      horizontalScrollbarSize: isMobile ? 4 : 10,
                    },
                    padding:              { top: 10, bottom: 10 },
                    renderValidationDecorations: "off",
                    overviewRulerLanes:   isMobile ? 0 : 3,
                    stickyScroll:         { enabled: !isMobile },
                  }}
                />
              ) : (
                <div style={{
                  height:"100%", overflowY:"auto",
                  background:"#1a1a1a", fontFamily:FONT_UI,
                }}>
                  <div style={{ maxWidth:860, margin:"0 auto", padding:"40px 32px 60px" }}>

                    {/* Header */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:36 }}>
                      <div>
                        <div style={{ fontSize:22, fontWeight:700, color:VS.textActive, marginBottom:4 }}>
                          My Projects
                        </div>
                        <div style={{ fontSize:13, color:VS.textMuted }}>
                          Open a project, import from GitHub, or describe a new app below.
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:10, flexShrink:0 }}>
                        <button
                          onClick={() => { setActivity("git"); setSideOpen(true); }}
                          style={{
                            display:"flex", alignItems:"center", gap:7,
                            padding:"8px 16px", borderRadius:8, border:`1px solid ${VS.border}`,
                            background:"#252526", color:VS.text, fontSize:13,
                            fontFamily:FONT_UI, cursor:"pointer", fontWeight:500,
                            transition:"all 0.15s",
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.borderColor=VS.accent; e.currentTarget.style.background="#2a2d2e"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.borderColor=VS.border; e.currentTarget.style.background="#252526"; }}
                        >
                          <Github size={15}/> Import from GitHub
                        </button>
                        <button
                          onClick={() => { setActivity("workspace"); setSideOpen(false); setTimeout(()=>chatInputRef.current?.focus(),100); }}
                          style={{
                            display:"flex", alignItems:"center", gap:7,
                            padding:"8px 16px", borderRadius:8, border:"none",
                            background: VS.accent, color:"#fff", fontSize:13,
                            fontFamily:FONT_UI, cursor:"pointer", fontWeight:600,
                            boxShadow:"0 2px 8px rgba(0,120,212,0.35)",
                            transition:"all 0.15s",
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.background=VS.accentHover; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background=VS.accent; }}
                        >
                          <Sparkles size={15}/> New with AI
                        </button>
                      </div>
                    </div>

                    {/* Project grid */}
                    {recentBuilds.length > 0 ? (
                      <>
                        <div style={{ fontSize:11, fontWeight:700, color:VS.textMuted, letterSpacing:"0.1em", marginBottom:14 }}>
                          RECENT PROJECTS
                        </div>
                        <div style={{
                          display:"grid",
                          gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",
                          gap:14,
                        }}>
                          {recentBuilds.map(build => {
                            const isLoading = loadingProjectId === build._id;
                            const isOk      = build.status === "complete";
                            const isFail    = build.status === "failed";
                            const date      = new Date(build.createdAt);
                            const dateStr   = date.toLocaleDateString(undefined,{month:"short",day:"numeric"});
                            const fileCount = build.files?.length ?? 0;

                            return (
                              <div
                                key={build._id}
                                onClick={() => !isLoading && loadProjectFiles(build)}
                                style={{
                                  background:"#252526",
                                  border:`1px solid ${VS.border}`,
                                  borderRadius:12,
                                  padding:"16px 16px 14px",
                                  cursor: isLoading ? "wait" : "pointer",
                                  transition:"border-color 0.15s, transform 0.12s, box-shadow 0.15s",
                                  userSelect:"none",
                                  position:"relative",
                                  overflow:"hidden",
                                }}
                                onMouseEnter={e=>{
                                  e.currentTarget.style.borderColor=VS.accent;
                                  e.currentTarget.style.transform="translateY(-2px)";
                                  e.currentTarget.style.boxShadow=`0 6px 20px rgba(0,0,0,0.35)`;
                                  const btn = e.currentTarget.querySelector(".grid-del-btn");
                                  if (btn) btn.style.opacity="1";
                                }}
                                onMouseLeave={e=>{
                                  e.currentTarget.style.borderColor=VS.border;
                                  e.currentTarget.style.transform="translateY(0)";
                                  e.currentTarget.style.boxShadow="none";
                                  const btn = e.currentTarget.querySelector(".grid-del-btn");
                                  if (btn) btn.style.opacity="0";
                                }}
                              >
                                {/* Delete button — top-right corner */}
                                <button
                                  className="grid-del-btn"
                                  onClick={e => deleteProject(build._id, e)}
                                  title="Delete project"
                                  style={{
                                    position:"absolute", top:10, right:10,
                                    opacity:0, transition:"opacity 0.15s, background 0.15s",
                                    width:26, height:26, borderRadius:6,
                                    background:"rgba(244,135,113,0.12)",
                                    border:"1px solid rgba(244,135,113,0.25)",
                                    color:VS.error, cursor:"pointer",
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    padding:0, zIndex:2,
                                  }}
                                  onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background="rgba(244,135,113,0.25)"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background="rgba(244,135,113,0.12)"; }}
                                >
                                  <Trash2 size={13}/>
                                </button>

                                {/* Project icon */}
                                <div style={{
                                  width:36, height:36, borderRadius:9,
                                  background:`rgba(0,120,212,0.12)`,
                                  border:`1px solid rgba(0,120,212,0.25)`,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  marginBottom:12,
                                }}>
                                  {isLoading
                                    ? <Loader2 size={16} color={VS.accent} style={{ animation:"spin 1s linear infinite" }}/>
                                    : <Zap size={16} color={VS.accent}/>
                                  }
                                </div>

                                {/* Name */}
                                <div style={{
                                  fontSize:13, fontWeight:600, color:VS.textActive,
                                  lineHeight:1.4, marginBottom:6,
                                  display:"-webkit-box", WebkitLineClamp:2,
                                  WebkitBoxOrient:"vertical", overflow:"hidden",
                                }}>
                                  {build.description}
                                </div>

                                {/* Meta row */}
                                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:"auto" }}>
                                  <span style={{
                                    fontSize:11, fontWeight:500,
                                    color: isOk ? VS.success : isFail ? VS.error : VS.textMuted,
                                    display:"flex", alignItems:"center", gap:3,
                                  }}>
                                    {isOk && <CheckCircle2 size={10}/>}
                                    {isFail && <AlertTriangle size={10}/>}
                                    {isOk ? "complete" : build.status}
                                  </span>
                                  {fileCount > 0 && (
                                    <span style={{ fontSize:11, color:VS.textFaint }}>· {fileCount} files</span>
                                  )}
                                  <span style={{ fontSize:11, color:VS.textFaint, marginLeft:"auto" }}>{dateStr}</span>
                                </div>

                                {/* Agent color bar */}
                                <div style={{
                                  position:"absolute", bottom:0, left:0, right:0, height:3,
                                  background:`linear-gradient(90deg,${VS.accent},#A78BFA,#F472B6)`,
                                  opacity: isOk ? 0.6 : 0.15,
                                }}/>
                              </div>
                            );
                          })}

                          {/* + New card */}
                          <div
                            onClick={() => { setActivity("workspace"); setSideOpen(false); setTimeout(()=>chatInputRef.current?.focus(),100); }}
                            style={{
                              background:"transparent",
                              border:`1.5px dashed rgba(255,255,255,0.1)`,
                              borderRadius:12, padding:"16px",
                              cursor:"pointer", transition:"border-color 0.15s, background 0.15s",
                              display:"flex", flexDirection:"column",
                              alignItems:"center", justifyContent:"center", gap:8, minHeight:130,
                            }}
                            onMouseEnter={e=>{ e.currentTarget.style.borderColor=VS.accent; e.currentTarget.style.background="rgba(0,120,212,0.04)"; }}
                            onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"; e.currentTarget.style.background="transparent"; }}
                          >
                            <div style={{
                              width:32, height:32, borderRadius:8,
                              background:"rgba(255,255,255,0.05)",
                              border:`1px solid rgba(255,255,255,0.1)`,
                              display:"flex", alignItems:"center", justifyContent:"center",
                            }}>
                              <Plus size={16} color={VS.textMuted}/>
                            </div>
                            <span style={{ fontSize:12, color:VS.textMuted, fontWeight:500 }}>New project</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Empty state */
                      <div style={{
                        border:`1.5px dashed rgba(255,255,255,0.08)`,
                        borderRadius:16, padding:"52px 32px",
                        textAlign:"center",
                      }}>
                        <div style={{
                          width:56, height:56, borderRadius:14, margin:"0 auto 16px",
                          background:"rgba(0,120,212,0.1)",
                          border:`1px solid rgba(0,120,212,0.2)`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}>
                          <Zap size={26} color={VS.accent}/>
                        </div>
                        <div style={{ fontSize:16, fontWeight:600, color:VS.textActive, marginBottom:8 }}>
                          No projects yet
                        </div>
                        <div style={{ fontSize:13, color:VS.textMuted, marginBottom:24, lineHeight:1.6 }}>
                          Describe your app in the chat below and 7 AI agents will<br/>generate every file — live.
                        </div>
                        <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
                          <button
                            onClick={() => { setActivity("workspace"); setSideOpen(false); setTimeout(()=>chatInputRef.current?.focus(),100); }}
                            style={{
                              padding:"9px 20px", borderRadius:8, border:"none",
                              background:VS.accent, color:"#fff", fontSize:13,
                              fontFamily:FONT_UI, cursor:"pointer", fontWeight:600,
                            }}
                          >
                            <Sparkles size={13} style={{ marginRight:6, verticalAlign:"middle" }}/>
                            Build with AI
                          </button>
                          <button
                            onClick={() => { setActivity("git"); setSideOpen(true); }}
                            style={{
                              padding:"9px 20px", borderRadius:8,
                              border:`1px solid ${VS.border}`,
                              background:"#252526", color:VS.text, fontSize:13,
                              fontFamily:FONT_UI, cursor:"pointer", fontWeight:500,
                            }}
                          >
                            <Github size={13} style={{ marginRight:6, verticalAlign:"middle" }}/>
                            Import from GitHub
                          </button>
                        </div>
                      </div>
                    )}

                    {/* GitHub import callout — only when projects exist */}
                    {recentBuilds.length > 0 && (
                      <div style={{
                        marginTop:36,
                        background:"#252526",
                        border:`1px solid ${VS.border}`,
                        borderRadius:12, padding:"18px 20px",
                        display:"flex", alignItems:"center", justifyContent:"space-between", gap:16,
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                          <div style={{
                            width:40, height:40, borderRadius:10, flexShrink:0,
                            background:"rgba(255,255,255,0.05)",
                            border:`1px solid ${VS.border}`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <Github size={20} color={VS.text}/>
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:VS.textActive, marginBottom:2 }}>
                              Import from GitHub
                            </div>
                            <div style={{ fontSize:12, color:VS.textMuted }}>
                              Connect a repo — AI agents can read, edit, and push changes back.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => { setActivity("git"); setSideOpen(true); }}
                          style={{
                            flexShrink:0, padding:"7px 16px", borderRadius:8,
                            border:`1px solid ${VS.border}`,
                            background:"#2d2d2d", color:VS.text,
                            fontSize:12, fontFamily:FONT_UI,
                            cursor:"pointer", fontWeight:500, whiteSpace:"nowrap",
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.borderColor=VS.accent; }}
                          onMouseLeave={e=>{ e.currentTarget.style.borderColor=VS.border; }}
                        >
                          Connect GitHub →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>{/* end Monaco pane */}

              {/* ── Live preview pane ────────────────────────────────────── */}
              {previewOpen && activeFile && (
                <div style={{
                  flex: "0 0 50%", display:"flex", flexDirection:"column",
                  borderLeft:`1px solid ${VS.border}`, overflow:"hidden",
                  background:"#fff",
                }}>
                  {/* Preview header */}
                  <div style={{
                    height:35, flexShrink:0, display:"flex", alignItems:"center",
                    justifyContent:"space-between", padding:"0 12px",
                    background:VS.titleBar, borderBottom:`1px solid ${VS.border}`,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Globe size={12} color={VS.accent}/>
                      <span style={{ fontSize:11, fontWeight:600, color:VS.text }}>
                        {activeFile.path.split("/").pop()} — Preview
                      </span>
                    </div>
                    <button
                      onClick={() => setPreviewOpen(false)}
                      style={{ background:"none", border:"none", cursor:"pointer", color:VS.textMuted, padding:2 }}
                      title="Close preview"
                    >
                      <X size={12}/>
                    </button>
                  </div>

                  {previewContent ? (
                    <iframe
                      key={activeFile.path}
                      srcDoc={previewContent}
                      title="Live preview"
                      sandbox="allow-scripts allow-modals allow-forms allow-popups"
                      style={{ flex:1, border:"none", width:"100%", background:"#fff" }}
                    />
                  ) : (
                    <div style={{
                      flex:1, display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center", gap:10,
                      background:VS.editorBg, color:VS.textMuted,
                    }}>
                      <Eye size={28} color={VS.textFaint}/>
                      <div style={{ fontSize:12, color:VS.textMuted, textAlign:"center", padding:"0 20px", lineHeight:1.6 }}>
                        No preview for <code style={{ fontFamily:FONT_MONO, fontSize:11, background:"#3C3C3C", padding:"1px 5px", borderRadius:3 }}>
                          .{activeFile.path.split(".").pop()}
                        </code> files.
                        <br/>
                        Open an <strong>.html</strong>, <strong>.css</strong>, <strong>.js</strong>, <strong>.svg</strong>, or <strong>.md</strong> file.
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>{/* end split wrapper */}
              </React.Fragment>
            );

            /* ── Conditional layout ── */
            if (isMobile) {
              return (
                <>
                  {sideOpen && activity !== "home" && activity !== "agents" && (
                    <div style={{
                      position:"absolute", top:0, left:0, right:0,
                      bottom:52, zIndex:100,
                      background:VS.sideBar,
                      borderBottom:`1px solid ${VS.border}`,
                      display:"flex", flexDirection:"column", overflow:"hidden",
                    }}>
                      {sideContent}
                    </div>
                  )}
                  <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", paddingBottom:52 }}>
                    {editorContent}
                  </div>
                </>
              );
            }

            /* Desktop: resizable PanelGroup */
            return (
              <PanelGroup
                orientation="horizontal"
                style={{ flex:1, overflow:"hidden" }}
              >
                {sideOpen && activity !== "home" && activity !== "agents" && (
                  <>
                    <Panel
                      defaultSize="20%"
                      minSize="15%"
                      maxSize="50%"
                      style={{
                        background: VS.sideBar,
                        borderRight: `1px solid ${VS.border}`,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      {sideContent}
                    </Panel>
                    <PanelResizeHandle
                      style={{
                        width: 4,
                        background: VS.border,
                        cursor: "col-resize",
                        flexShrink: 0,
                        transition: "background 0.15s",
                      }}
                    />
                  </>
                )}
                <Panel
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {editorContent}
                </Panel>
              </PanelGroup>
            );
          })()}
        </div>

        {/* ══ Status bar ══════════════════════════════════════════════════ */}
        <div style={{
          height: isMobile ? 20 : 22, flexShrink:0,
          background: phase==="error" ? "#5A1D1D" : VS.statusBar,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 10px", fontSize:11, color:"#fff", userSelect:"none",
          transition:"background 0.3s", overflow:"hidden",
        }}>
          {/* Left */}
          <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 8 : 14, overflow:"hidden" }}>
            {!isMobile && (
              <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                <GitBranch size={12}/>
                <span>main</span>
              </div>
            )}
            {phase === "building" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, overflow:"hidden" }}>
                <Loader2 size={11} style={{ animation:"spin 1s linear infinite", flexShrink:0 }}/>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {activeAgent ? `${activeAgent} generating…` : "Starting pipeline…"}
                </span>
              </div>
            )}
            {phase === "complete" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                <CheckCircle2 size={11}/>
                <span>{allFiles.length} files generated</span>
              </div>
            )}
            {phase === "error" && (
              <div style={{ display:"flex", alignItems:"center", gap:5, color:"#F48771", overflow:"hidden" }}>
                <AlertTriangle size={11} style={{ flexShrink:0 }}/>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{errorMsg}</span>
              </div>
            )}
          </div>
          {/* Right */}
          <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 8 : 14, flexShrink:0 }}>
            {!isMobile && activeFile && (
              <>
                <span>Ln {lineCol.line}, Col {lineCol.col}</span>
                <span>Spaces: 2</span>
                <span>UTF-8</span>
                <span style={{ textTransform:"capitalize" }}>
                  {getMonacoLang(activeFile.path, activeFile.language)}
                </span>
              </>
            )}
            {isMobile && activeFile && (
              <span style={{ textTransform:"capitalize" }}>
                {getMonacoLang(activeFile.path, activeFile.language)}
              </span>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
              <Zap size={11}/>
              {!isMobile && <span>Firebox AI</span>}
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
