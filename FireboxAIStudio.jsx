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
  Eye, EyeOff, Globe, Plus, Github, Trash2, PanelLeftClose, PanelLeftOpen, Workflow, Flame, Sun, Moon,
  ShoppingCart, GraduationCap, Landmark, CalendarDays, MessageCircle, Bot, Store, SlidersHorizontal, Layers3, Boxes, ClipboardList, BarChart3, LockKeyhole, LogOut,
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

const LIGHT_VS = {
  ...VS,
  titleBar: "#F8FAFC", activityBar: "#EEF2F7", sideBar: "#F4F6F8", sideHead: "#F4F6F8",
  editorBg: "#FFFFFF", tabBar: "#F1F3F5", activeTab: "#FFFFFF", inactiveTab: "#E7EBEF", statusBar: "#0067B8",
  panelBg: "#FFFFFF", terminalBg: "#F8FAFC", border: "#D7DDE3", borderLight: "#C3CBD4",
  text: "#334155", textMuted: "#64748B", textFaint: "#94A3B8", textActive: "#0F172A",
  accent: "#0067B8", accentHover: "#005A9E", success: "#16835B", error: "#C2412D", warning: "#9A6700",
};

const FONT_UI   = "'Inter', 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "'Cascadia Code', 'Fira Code', 'IBM Plex Mono', Menlo, monospace";

const BUILD_LAUNCHER_TYPES = [
  { Icon: Globe, label: "Website", description: "Build a complete web application.", prompt: "Build a complete web application" },
  { Icon: Code2, label: "Mobile", description: "Create a mobile application.", prompt: "Create a mobile application" },
  { Icon: Package, label: "Dashboard", description: "Create an admin or business dashboard.", prompt: "Create an admin/business dashboard" },
  { Icon: Server, label: "API", description: "Build a backend or API.", prompt: "Build a backend/API" },
  { Icon: Sparkles, label: "Landing Page", description: "Create a marketing website.", prompt: "Create a marketing website" },
];

const BUILD_SUBTITLE_PROMPTS = [
  "Describe an idea and Firebox will turn it into a real project.",
  "Start with a thought and Firebox will shape the architecture.",
  "Explain what you need and Firebox will build the first version.",
];

const BUILD_TYPEWRITER_PROMPTS = [
  "Build a school management platform with students, teachers, payments, and reports.",
  "Create an e-commerce marketplace with seller dashboards and checkout.",
  "Design a modern analytics dashboard for a growing business.",
  "Build an AI-powered customer support application with team workspaces.",
];

const IMPORT_BINARY_EXTENSIONS = new Set(["png","jpg","jpeg","gif","webp","ico","bmp","avif","svg","woff","woff2","ttf","eot","otf","pdf","zip","gz","tar","7z","mp4","webm","mov","mp3","wav","ogg","flac","exe","dll","so","dylib"]);
function isImportBinaryPath(path) {
  const ext = String(path || "").split(".").pop().toLowerCase();
  return IMPORT_BINARY_EXTENSIONS.has(ext);
}
const BUILD_IDEA_EXAMPLES = [
  { Icon: ShoppingCart, label: "E-commerce", prompt: "Build an e-commerce platform where customers can browse products, add items to a cart, and complete purchases." },
  { Icon: GraduationCap, label: "School Management", prompt: "Build a school management platform with students, teachers, payments, attendance, and reports." },
  { Icon: Landmark, label: "Fintech", prompt: "Build a fintech dashboard with accounts, transactions, transfers, spending insights, and secure authentication." },
  { Icon: Home, label: "Real Estate", prompt: "Build a real estate platform where agents can list properties and users can search, filter, save, and inquire about listings." },
  { Icon: CalendarDays, label: "Booking Platform", prompt: "Build a booking platform with availability calendars, appointment creation, reminders, and an admin panel." },
  { Icon: MessageCircle, label: "Social App", prompt: "Build a social application with profiles, posts, comments, likes, direct messages, and notifications." },
  { Icon: Bot, label: "AI SaaS", prompt: "Build an AI SaaS application with authentication, a workspace, usage tracking, billing, and an AI-powered workflow." },
  { Icon: Store, label: "Marketplace", prompt: "Build a marketplace where sellers can list products, customers can browse and purchase, sellers have dashboards, and admins can manage listings." },
];

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
  { id:"openai", Icon:Brain, title:"OpenAI", subtitle:"GPT models", description:"Powerful general-purpose models for coding, reasoning, and creativity.", color:"#4EC994", action:"Configure", enabled:true },
  { id:"anthropic", Icon:Sparkles, title:"Anthropic", subtitle:"Claude models", description:"Advanced reasoning, large context understanding, and safe-by-design models.", color:"#F3A65B", action:"Configure", enabled:true },
  { id:"google", Icon:Globe, title:"Google", subtitle:"Gemini models", description:"Multimodal capabilities with long context and strong performance.", color:"#60A5FA", action:"Configure", enabled:true },
  { id:"openrouter", Icon:GitBranch, title:"OpenRouter", subtitle:"Multiple providers", description:"Access multiple model providers through one unified interface.", color:"#A78BFA", action:"Configure", enabled:true },
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
    Icon: ShoppingCart,
    label: "E-commerce store",
    prompt: "Build a full-stack e-commerce store with product listings, shopping cart, user auth, and Stripe checkout integration",
  },
  {
    Icon: MessageCircle,
    label: "Real-time chat app",
    prompt: "Build a real-time chat application with WebSocket support, multiple rooms, user presence indicators, and message history",
  },
  {
    Icon: ClipboardList,
    label: "Project management",
    prompt: "Build a project management app with Kanban boards, task assignment, due dates, comments, and team collaboration features",
  },
  {
    Icon: BarChart3,
    label: "Analytics dashboard",
    prompt: "Build an analytics dashboard with interactive charts, KPI cards, date range filters, CSV export, and a REST API backend",
  },
  {
    Icon: Bot,
    label: "AI chatbot",
    prompt: "Build an AI-powered chatbot app with streaming responses, conversation history, system prompt configuration, and a clean chat UI",
  },
  {
    Icon: LockKeyhole,
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

/* ─── Firebox Agent Mark ──────────────────────────────────────────────────── */
function FireboxAgentMark({ size = 28, animated = false, state = "idle" }) {
  const gradientId = `firebox-mark-${size}-${state}`;
  const accent = state === "complete" ? "#4EC994" : state === "error" ? "#F48771" : "#38BDF8";
  return (
    <span className={animated ? "firebox-agent-mark is-animated" : "firebox-agent-mark"} style={{ width:size, height:size, display:"inline-flex", flexShrink:0, color:accent }} aria-label="Firebox Agent">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="12" y1="8" x2="52" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor={accent}/><stop offset="1" stopColor="#A78BFA"/></linearGradient>
        </defs>
        <circle className="firebox-agent-halo" cx="32" cy="32" r="26" stroke={`url(#${gradientId})`} strokeWidth="1.2" strokeDasharray="1 8" strokeLinecap="round" opacity="0.7"/>
        <g className="firebox-agent-orbit"><circle cx="32" cy="6" r="2.2" fill={accent}/><circle cx="58" cy="32" r="1.4" fill="#A78BFA"/></g>
        <path d="M32 5C25 14 15 20 15 35c0 12 7.5 22 17 24 9.5-2 17-12 17-24 0-8-3.7-14.7-9.4-20.1-1.2 6.1-4.5 9.6-8.8 11.4 1.1-7.4-1.8-14-8.8-21.3Z" fill={`url(#${gradientId})`} opacity="0.96"/>
        <path d="M32 25c-3.4 5.2-7.5 8.1-7.5 14 0 5.6 3.1 10 7.5 12 4.4-2 7.5-6.4 7.5-12 0-3.4-1.5-6.3-4.2-8.8-.5 2.3-1.5 3.8-3.3 4.8.4-3.4-.8-6.4-4.1-10Z" fill="#181818" opacity="0.9"/>
        <path d="M18 23h6M40 23h6M20 43h6M38 43h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.9"/>
        <path d="M24 23v5M40 23v5M26 43v-5M38 43v-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.85"/>
        <circle cx="18" cy="23" r="2.6" fill="currentColor"/><circle cx="46" cy="23" r="2.6" fill="currentColor"/><circle cx="20" cy="43" r="2.6" fill="currentColor"/><circle cx="44" cy="43" r="2.6" fill="currentColor"/>
        <g className="firebox-agent-core"><path d="m32 30 1.6 3.3 3.4 1.7-3.4 1.7L32 40l-1.6-3.3-3.4-1.7 3.4-1.7L32 30Z" fill="#fff"/><circle cx="32" cy="35" r="2" fill="#fff" opacity="0.55"/></g>
      </svg>
    </span>
  );
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
  const [isLightMode, setIsLightMode] = useState(() => {
    try { return localStorage.getItem("firebox-theme") === "light"; } catch { return false; }
  });
  const palette = isLightMode ? LIGHT_VS : VS;

  useEffect(() => {
    try { localStorage.setItem("firebox-theme", isLightMode ? "light" : "dark"); } catch {}
    document.body.style.background = palette.editorBg;
  }, [isLightMode, palette.editorBg]);

  /* build state */
  const [phase,          setPhase]          = useState("idle");
  const [description,    setDescription]    = useState("");
  const [agentStates,    setAgentStates]    = useState(
    AGENT_META.map((a) => ({ name:a.name, status:"idle", streaming:"" }))
  );
  const [activeAgent,    setActiveAgent]    = useState(null);
  const [workflowStage,  setWorkflowStage]  = useState(null);
  const [buildPaused,    setBuildPaused]    = useState(false);
  const [allFiles,       setAllFiles]       = useState([]);
  const [errorMsg,       setErrorMsg]       = useState("");
  const [recentBuilds,   setRecentBuilds]   = useState([]);
  const [currentBuildId, setCurrentBuildId] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState("firebox-project");
  const [currentProjectMeta, setCurrentProjectMeta] = useState({ fileCount: 0, framework: null, packageManager: null });
  const [projectOpenStatus, setProjectOpenStatus] = useState(null);
  const [buildPlan, setBuildPlan] = useState(null);
    const [planning,       setPlanning]       = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [preHomeVisible, setPreHomeVisible] = useState(() => {
    try { return localStorage.getItem("firebox-prehome-complete") !== "true"; } catch { return true; }
  });
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [preHomeTypewriter, setPreHomeTypewriter] = useState("");
  const [settingsSection, setSettingsSection] = useState("profile");
  const [profileName, setProfileName] = useState(() => { try { return localStorage.getItem("firebox-profile-name") || ""; } catch { return ""; } });
  const [workspaceAutoSave, setWorkspaceAutoSave] = useState(() => { try { return localStorage.getItem("firebox-autosave") !== "false"; } catch { return true; } });
  const [settingsSaved, setSettingsSaved] = useState(false);

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
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [typewriterText, setTypewriterText] = useState("");
  const [typewriterStopped, setTypewriterStopped] = useState(false);
  const [subtitleText, setSubtitleText] = useState("");
  const [launcherFramework, setLauncherFramework] = useState("auto");
  const [launcherPackageManager, setLauncherPackageManager] = useState("auto");
  const [launcherDatabase, setLauncherDatabase] = useState("auto");

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
  const [zipImportOpen, setZipImportOpen] = useState(false);
  const [zipDragActive, setZipDragActive] = useState(false);
  const zipInputRef = useRef(null);
  const newProjRef = useRef(null);

  /* layout state */
  const [activity,    setActivity]    = useState("home");        // "home"|"workspace"|"explorer"|"agents"|"search"|"git"|"projects"
  const [sideOpen,    setSideOpen]    = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [navExpanded, setNavExpanded] = useState(() => {
    try { return localStorage.getItem("firebox-nav-expanded") !== "false"; } catch { return true; }
  });
  const [lineCol,     setLineCol]     = useState({ line:1, col:1 });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me").then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && data.user) {
        setAuthUser(data.user);
        setPreHomeVisible(false);
        try { localStorage.setItem("firebox-prehome-complete", "true"); } catch {}
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!preHomeVisible) { setPreHomeTypewriter(""); return undefined; }
    const phrases = ["Build the future with Firebox.", "Turn your ideas into real software.", "Create. Code. Ship with confidence."];
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer;
    const tick = () => {
      const phrase = phrases[phraseIndex];
      if (!deleting) {
        charIndex = Math.min(charIndex + 1, phrase.length);
        setPreHomeTypewriter(phrase.slice(0, charIndex));
        if (charIndex === phrase.length) { deleting = true; timer = setTimeout(tick, 1600); return; }
      } else {
        charIndex = Math.max(charIndex - 1, 0);
        setPreHomeTypewriter(phrase.slice(0, charIndex));
        if (charIndex === 0) { deleting = false; phraseIndex = (phraseIndex + 1) % phrases.length; timer = setTimeout(tick, 350); return; }
      }
      timer = setTimeout(tick, deleting ? 28 : 52);
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, [preHomeVisible]);
  useEffect(() => {
    if (activity !== "home" || chatInput.trim() || typewriterStopped) {
      setTypewriterText("");
      return undefined;
    }
    let cancelled = false;
    let phraseIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let pauseUntil = 0;
    let timer;
    const tick = () => {
      if (cancelled) return;
      const phrase = BUILD_TYPEWRITER_PROMPTS[phraseIndex];
      if (Date.now() < pauseUntil) {
        timer = setTimeout(tick, 80);
        return;
      }
      if (!deleting) {
        characterIndex = Math.min(characterIndex + 1, phrase.length);
        setTypewriterText(phrase.slice(0, characterIndex));
        if (characterIndex === phrase.length) {
          deleting = true;
          pauseUntil = Date.now() + 1400;
        }
      } else {
        characterIndex = Math.max(characterIndex - 1, 0);
        setTypewriterText(phrase.slice(0, characterIndex));
        if (characterIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % BUILD_TYPEWRITER_PROMPTS.length;
          pauseUntil = Date.now() + 350;
        }
      }
      timer = setTimeout(tick, deleting ? 28 : 48);
    };
    timer = setTimeout(tick, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activity, chatInput, typewriterStopped]);

  useEffect(() => {
    if (activity !== "home") {
      setSubtitleText("");
      return undefined;
    }
    let cancelled = false;
    let phraseIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let pauseUntil = 0;
    let timer;
    const tick = () => {
      if (cancelled) return;
      const phrase = BUILD_SUBTITLE_PROMPTS[phraseIndex];
      if (Date.now() < pauseUntil) {
        timer = setTimeout(tick, 90);
        return;
      }
      if (!deleting) {
        characterIndex = Math.min(characterIndex + 1, phrase.length);
        setSubtitleText(phrase.slice(0, characterIndex));
        if (characterIndex === phrase.length) {
          deleting = true;
          pauseUntil = Date.now() + 1800;
        }
      } else {
        characterIndex = Math.max(characterIndex - 1, 0);
        setSubtitleText(phrase.slice(0, characterIndex));
        if (characterIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % BUILD_SUBTITLE_PROMPTS.length;
          pauseUntil = Date.now() + 400;
        }
      }
      timer = setTimeout(tick, deleting ? 24 : 42);
    };
    timer = setTimeout(tick, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activity]);

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
  const [gitBranches,      setGitBranches]      = useState([]);
  const [gitBranchesLoading,setGitBranchesLoading] = useState(false);

  const terminalRef    = useRef(null);
  const chatInputRef   = useRef(null);
    const esRef            = useRef(null);
  const streamTerminalRef = useRef(false);
  const streamingRef     = useRef({});
  const editorRef      = useRef(null);
  const agentTimerRefs = useRef({});  // { name: { elapsed: intervalId, steps: timeoutIds[] } }
  const loadProjectFilesRef = useRef(null);

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
    if (!authUser) { setRecentBuilds([]); return; }
    fetch("/api/builds").then(r => r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(()=>{ setRecentBuilds([]); });
  }, [authUser]);

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

  /* ── Shared external-project persistence ──────────────────────────────── */
  const persistImportedProject = useCallback(async ({ files, projectName, description, source, sourceMeta = {} }) => {
    const normalizedFiles = files
      .filter(file => file?.path && typeof file.content === "string")
      .map(file => ({ ...file, agent: file.agent || (source === "github" ? "GitHub Import" : "ZIP Import"), language: file.language || "plaintext", encoding: file.encoding || "utf8", isBinary: Boolean(file.isBinary) }));
    if (!normalizedFiles.length) throw new Error("No readable project files found");
    const response = await fetch("/api/import/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName, description, source, sourceMeta, files: normalizedFiles }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Import failed with HTTP ${response.status}`);
    const importedBuild = { _id: data.buildId, projectName: data.projectName || projectName, description, importSource: source };
    await loadProjectFilesRef.current?.(importedBuild);
    fetch("/api/builds").then(r => r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(() => {});
    return data;
  }, []);

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
    try {
      const files = [];
      async function readDir(handle, prefix) {
        for await (const [name, entry] of handle.entries()) {
          if (name === "node_modules" || name === ".git") continue;
          const path = prefix ? `${prefix}/${name}` : name;
          if (entry.kind === "file") {
            try {
              const file = await entry.getFile();
              const isBinary = isImportBinaryPath(path);
              files.push({ path, content: await (isBinary ? new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const bytes = new Uint8Array(reader.result); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); resolve(btoa(binary)); }; reader.onerror = reject; reader.readAsArrayBuffer(file); }) : file.text()), agent: "Folder Import", language: "", encoding: isBinary ? "base64" : "utf8", isBinary });
            } catch {}
          } else await readDir(entry, path);
        }
      }
      await readDir(dirHandle, "");
      await persistImportedProject({ files, projectName: dirHandle.name, description: `Imported folder: ${dirHandle.name}`, source: "folder", sourceMeta: { folderName: dirHandle.name } });
    } catch (err) { setErrorMsg(err.message); }
    setImporting(false);
  }, [persistImportedProject]);

  /* ── Import: ZIP file ─────────────────────────────────────────────────── */
  const processZipFile = useCallback(async (zipFile) => {
    if (!zipFile || !/\.zip$/i.test(zipFile.name)) { setErrorMsg("Please choose a .zip project file."); return; }
    setImporting(true);
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const files = [];
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const seg = path.split("/");
        if (seg.some(s => s === "node_modules" || s === ".git")) continue;
        try {
          const isBinary = isImportBinaryPath(path);
          files.push({ path, content: await entry.async(isBinary ? "base64" : "string"), agent: "ZIP Import", language: "", encoding: isBinary ? "base64" : "utf8", isBinary });
        } catch {}
      }
      const rawName = zipFile.name.replace(/\.zip$/i, "").trim() || "firebox-project";
      await persistImportedProject({ files, projectName: rawName, description: `Imported ZIP: ${zipFile.name}`, source: "zip", sourceMeta: { fileName: zipFile.name, size: zipFile.size } });
      setZipImportOpen(false);
    } catch (err) { setErrorMsg(err.message); }
    setImporting(false);
  }, [persistImportedProject]);
  const importZip = useCallback(() => {
    setNewProjOpen(false);
    setZipImportOpen(true);
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
      if (aiProvider !== "local") {
        const response = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: aiProvider, localAi: localAiConfig, description: `Reply with exactly: Firebox ${aiProvider} connection OK`, fileNames: [] }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.plan) throw new Error(data.error || `${aiProvider} connection test failed`);
        setLocalAiTestState("success");
        setLocalAiTestMessage(`Connection works. ${data.plan.summary || "Provider returned a valid response."}`);
        return;
      }
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
  }, [aiProvider, localAiConfig, localEngineUrl, localEngineToken]);

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
    setPreviewUrl(null);
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
          toolMode: true,
        } : {
          description: buildDesc,
          provider: aiProvider,
          localAi: aiProvider !== "cloud" ? localAiConfig : undefined,
          toolMode: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      buildId = useLocalEngine ? data.jobId : data.buildId;
      setCurrentBuildId(buildId);
      setCurrentProjectName(data.projectName || "firebox-project");
    } catch (err) { setPhase("error"); setErrorMsg(err.message); return; }

    const eventUrl = useLocalEngine
      ? `${engineBase}/api/build/${buildId}/events?token=${encodeURIComponent(localEngineToken.trim())}`
      : `/api/build/${buildId}/events`;
    streamTerminalRef.current = false;
    const es = new EventSource(eventUrl);
    esRef.current = es;

    es.addEventListener("workflow-stage-start", e => {
      setBuildPaused(false);
      try { setWorkflowStage(JSON.parse(e.data)); } catch { /* ignore malformed activity event */ }
    });
    es.addEventListener("workflow-stage-complete", e => {
      try { setWorkflowStage(prev => ({ ...(prev || {}), ...JSON.parse(e.data), completed:true })); } catch { /* ignore malformed activity event */ }
    });
    es.addEventListener("workflow-paused", e => {
      setBuildPaused(true);
      setWorkflowStage(prev => ({ ...(prev || {}), activity:"Paused at a safe checkpoint", paused:true }));
    });
    es.addEventListener("workflow-resumed", e => {
      setBuildPaused(false);
      setWorkflowStage(prev => ({ ...(prev || {}), activity:"Resuming workflow", paused:false }));
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

    es.addEventListener("files-updated", async e => {
      try {
        const { files = [] } = JSON.parse(e.data);
        if (!files.length) return;
        const response = await fetch(`/api/build/${buildId}`);
        const project = await response.json();
        if (!response.ok || !Array.isArray(project.files)) return;
        setAllFiles(project.files);
        const first = project.files[0];
        if (first && !activeTabPath) {
          setOpenTabs([first]);
          setActiveTabPath(first.path);
          setTabContents({ [first.path]: first.content });
        }
      } catch { /* keep the stream alive; the next update can retry */ }
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
      streamTerminalRef.current = true;
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

    es.addEventListener("build-complete", e => {
      streamTerminalRef.current = true;
      let completion = {};
      try { completion = JSON.parse(e.data); } catch { /* ignore malformed completion event */ }
      setPreviewUrl(completion.preview?.url || null);
      setPhase("complete");
      setActiveAgent(null);
      setWorkflowStage({ stage:"preview", label:"Preview", activity:"Build complete — preview is ready", completed:true });
      setPreviewOpen(true);
      es.close();
      fetch("/api/builds").then(r=>r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(()=>{});
    });

    es.addEventListener("build-error", e => {
      streamTerminalRef.current = true;
      const { message } = JSON.parse(e.data);
      setPhase("error"); setErrorMsg(message); es.close();
    });

    es.onerror = () => {
      if (streamTerminalRef.current) return;
      setPhase("error");
      setErrorMsg("Connection lost before the Agent returned a result. Check the provider response and Railway logs.");
      es.close();
    };
  }, [updateAgent, aiProvider, localAiConfig, localEngineUrl, localEngineToken]);

  const setBuildExecutionState = useCallback(async (nextState) => {
    if (!currentBuildId) return;
    const useLocalEngine = aiProvider === "local";
    const engineBase = localEngineUrl.trim().replace(/\/+$/, "");
    if (useLocalEngine && (!engineBase || !localEngineToken.trim())) return;
    const url = useLocalEngine ? `${engineBase}/api/build/${currentBuildId}/${nextState === "paused" ? "pause" : "resume"}` : `/api/build/${currentBuildId}/${nextState === "paused" ? "pause" : "resume"}`;
    const headers = { "Content-Type": "application/json" };
    if (useLocalEngine) headers.Authorization = `Bearer ${localEngineToken.trim()}`;
    try {
      const response = await fetch(url, { method:"POST", headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to change build execution state");
      setBuildPaused(data.executionState === "paused");
    } catch (error) {
      setErrorMsg(error.message);
    }
  }, [currentBuildId, aiProvider, localEngineUrl, localEngineToken]);

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
          localAi: aiProvider !== "cloud" ? localAiConfig : undefined,
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
      const response = await fetch(requestUrl, { method:"POST", headers, body: JSON.stringify({ description:text, fileNames:allFiles.map(file => file.path), provider:aiProvider, endpoint:localAiConfig.endpoint, model:localAiConfig.model, apiKey:localAiConfig.apiKey, localAi:aiProvider !== "cloud" ? localAiConfig : undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.plan) throw new Error(data.error || "Unable to create a build plan");
      setBuildPlan({ ...data.plan, request:text });
      setChatHistory(prev => [...prev, { role:"ai", text:`${data.plan.summary}\n\n${data.plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nStarting the Firebox Agent now…` }]);
      setBuildPlan(null);
      await startBuild(text);
    } catch (error) {
      setChatHistory(prev => [...prev, { role:"ai", text:`I couldn't create the plan yet: ${error.message}` }]);
    } finally {
      setPlanning(false);
    }
  }, [planning, aiProvider, localEngineUrl, localEngineToken, localAiConfig, allFiles, startBuild]);

  const confirmBuildPlan = useCallback((override = false) => {
    if (!buildPlan?.request || (buildPlan.needsConfirmation && !override)) return;
    const request = buildPlan.request;
    setBuildPlan(null);
    setDescription(request);
    startBuild(request);
  }, [buildPlan, startBuild]);

  /* ── Send chat message — AI replies first, then acts ──────────────────── */
  const sendChatMessage = useCallback(async () => {
    const baseText = chatInput.trim();
    if (!baseText) return;
    const launcherOverrides = activity === "home" && advancedOptionsOpen
      ? `\n\nOptional technical preferences (use only when compatible): framework=${launcherFramework}; package manager=${launcherPackageManager}; database=${launcherDatabase}. Firebox should still choose the safest compatible stack when an option is set to auto.`
      : "";
    const text = `${baseText}${launcherOverrides}`;
    if (activity === "home" && allFiles.length === 0) {
      setChatInput("");
      await startBuild(text);
      return;
    }
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
            localAi: aiProvider !== "cloud" ? localAiConfig : undefined,
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
  }, [chatInput, chatHistory, requestBuildPlan, startEditFiles, startBuild, currentBuildId, allFiles, aiProvider, localAiConfig, activity, advancedOptionsOpen, launcherFramework, launcherPackageManager, launcherDatabase]);

  const stopBuild = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    Object.values(agentTimerRefs.current).forEach(({ elapsed, steps }) => { clearInterval(elapsed); steps.forEach(clearTimeout); });
    agentTimerRefs.current = {};
    setActiveAgent(null);
    setBuildPaused(false);
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
    setChatHistory([]); setChatInput(""); setTypewriterStopped(false); setTypewriterText("");
    setCurrentBuildId(null);
    setCurrentProjectName("firebox-project");
    setCurrentProjectMeta({ fileCount: 0, framework: null, packageManager: null });
    setProjectOpenStatus(null);
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
    setActivity("workspace"); setSideOpen(false);
    const waitFiveSeconds = () => new Promise(resolve => setTimeout(resolve, 5000));
    try {
      setProjectOpenStatus({ phase: "opening", currentStepIndex: 0, message: "Opening Firebox project…", steps: ["Project loaded", "Files found", "Framework detected", "Dependencies detected", "Workspace ready"] });
      const res  = await fetch(`/api/build/${build._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load project");
      const files = data.files || [];
      const packageFile = files.find(file => file.path === "package.json" || file.path.endsWith("/package.json"));
      let packageJson = null;
      try { packageJson = packageFile ? JSON.parse(packageFile.content) : null; } catch {}
      const packageManager = files.some(file => file.path.endsWith("pnpm-lock.yaml")) ? "pnpm" : files.some(file => file.path.endsWith("yarn.lock")) ? "Yarn" : files.some(file => file.path.endsWith("package-lock.json")) ? "npm" : null;
      const deps = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
      const framework = deps.vite ? "React + Vite" : deps.next ? "Next.js" : deps.react ? "React" : deps.vue ? "Vue" : deps.svelte ? "Svelte" : packageJson ? "Node.js project" : null;
      const steps = ["Project loaded", `${files.length} files found`, framework ? `${framework} detected` : "Project structure detected", packageManager ? `${packageManager} dependencies detected` : "Project metadata detected", "Workspace ready"];
      setProjectOpenStatus({ phase: "opening", currentStepIndex: 0, message: steps[0], steps });
      await waitFiveSeconds();
      for (let index = 1; index < steps.length; index += 1) {
        setProjectOpenStatus({ phase: "opening", currentStepIndex: index, message: steps[index], steps });
        await waitFiveSeconds();
      }
      setAllFiles(files);
      setProjectFilesMap(prev => ({ ...prev, [build._id]: files }));
      setOpenTabs([]); setActiveTabPath(null); setTabContents({});
      const first = files.find(file => /(^|\/)(README|package\.json|src\/App|src\/main|index\.html)/i.test(file.path)) || files[0];
      if (first) {
        setOpenTabs([first]); setActiveTabPath(first.path);
        setTabContents({ [first.path]: first.content });
      }
      setCurrentProjectName(build.projectName || build.name || "firebox-project");
      setCurrentProjectMeta({ fileCount: files.length, framework, packageManager });
      setDescription(build.description || "");
      setCurrentBuildId(build._id);
      setEditingFiles(false); setEditStream(""); setEditChangedFiles([]); setEditError("");
      setPhase("complete");
      setProjectOpenStatus({ phase: "ready", currentStepIndex: steps.length, message: "Workspace ready", steps });
    } catch (err) {
      console.error("Project opening failed", err);
      setProjectOpenStatus({ phase: "error", currentStepIndex: -1, message: err.message || "Unable to open project", steps: [] });
    }
    setLoadingProjectId(null);
  }, []);
  loadProjectFilesRef.current = loadProjectFiles;

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
    setGitRepo(null); setGitFileShas({}); setGitBranches([]); setGitError("");
    setGitPushResult(null); setGitShowPromptStep(false);
  }, []);

  /* ── Git: connect repo ───────────────────────────────────────────────────── */
  const connectGitRepo = useCallback(async (repoFullName, requestedBranch = "") => {
    const token = gitToken;
    if (!repoFullName || !token) return;
    setGitConnecting(true); setGitError(""); setGitRepo(null);
    try {
      const res  = await fetch("/api/git/connect", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ repoUrl: `github.com/${repoFullName}`, token, branch: requestedBranch || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGitRepo(data);
      setGitFileShas({});
      setGitBranchesLoading(true);
      fetch("/api/git/branches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: data.owner, repo: data.repo, token }),
      }).then(branchRes => branchRes.json().then(branchData => {
        if (branchRes.ok && Array.isArray(branchData)) setGitBranches(branchData);
      })).catch(() => {}).finally(() => setGitBranchesLoading(false));
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
      const responseText = await res.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch {
        // A stale proxy or frontend fallback can return index.html for this API call.
        // Fall back to GitHub directly so Source Control remains usable while the backend redeploys.
        if (responseText.trimStart().startsWith("<!DOCTYPE") || responseText.trimStart().startsWith("<html")) {
          const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
          const directRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(gitRepo.owner)}/${encodeURIComponent(gitRepo.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(gitRepo.branch)}`, {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${gitToken}`,
              "X-GitHub-Api-Version": "2022-11-28",
            },
          });
          const directText = await directRes.text();
          try { data = JSON.parse(directText); }
          catch { throw new Error(`GitHub file request returned non-JSON data (HTTP ${directRes.status})`); }
          if (!directRes.ok) throw new Error(data.message || `GitHub returned HTTP ${directRes.status}`);
          if (!data.content) throw new Error("GitHub returned no file content");
          const binary = atob(data.content.replace(/\s/g, ""));
          const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
          data.content = new TextDecoder().decode(bytes);
        } else {
          throw new Error(`GitHub file request returned non-JSON data (HTTP ${res.status})`);
        }
      }
      if (!res.ok && !data.content) throw new Error(data.error || `GitHub file request failed with HTTP ${res.status}`);
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

    try {
      const importedBuild = { _id: buildId, description: `Imported from GitHub: ${gitRepo.owner}/${gitRepo.repo}`, projectName: gitRepo.repo };
      await loadProjectFiles(importedBuild);
      setGitError("");
      fetch("/api/builds").then(r => r.json()).then(d => Array.isArray(d) && setRecentBuilds(d)).catch(() => {});
    } catch (err) {
      setGitError(err.message);
    }

    setGitImporting(false);
  }, [gitRepo, gitToken, gitImporting, loadProjectFiles]);

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
    const build = recentBuilds.find(item => item._id === buildId);
    if (!build) return;
    await loadProjectFiles(build);
  }, [recentBuilds, loadProjectFiles]);

  /* ── Derived ──────────────────────────────────────────────────────────── */
  const doneCount   = agentStates.filter(a => a.status==="done").length;
  const progress    = (doneCount / AGENT_META.length) * 100;
  const activeFile  = openTabs.find(t => t.path === activeTabPath);
  const activeContent = activeFile ? (tabContents[activeFile.path] ?? activeFile.content) : "";

  // Group files by agent for the tree
  const filesByAgent = useMemo(() => {
    const m = {};
    AGENT_META.forEach(a => { m[a.name] = []; });
    allFiles.forEach(f => {
      const group = f.agent || "Imported files";
      if (!m[group]) m[group] = [];
      m[group].push(f);
    });
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
    monaco.editor.setTheme(isLightMode ? "vs" : "firebox-dark");
    editor.onDidChangeCursorPosition(e => {
      setLineCol({ line: e.position.lineNumber, col: e.position.column });
    });
  }

  function handleEditorChange(value) {
    if (activeTabPath) {
      setTabContents(prev => ({ ...prev, [activeTabPath]: value }));
    }
  }

  const submitAuth = async (event) => {
    event?.preventDefault();
    setAuthBusy(true); setAuthMessage("");
    try {
      const response = await fetch(`/api/auth/${authMode === "register" ? "register" : "login"}`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ email:authEmail, password:authPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Authentication failed");
      setAuthUser(data.user); setAuthPassword(""); setAuthMessage(""); setPreHomeVisible(false);
      try { localStorage.setItem("firebox-prehome-complete", "true"); } catch {}
    } catch (error) { setAuthMessage(error.message); }
    finally { setAuthBusy(false); }
  };
  const continueAsGuest = () => {
    setPreHomeVisible(false);
    try { localStorage.setItem("firebox-prehome-complete", "true"); } catch {}
  };
  const logout = async () => {
    try { await fetch("/api/auth/logout", { method:"POST" }); } catch {}
    setAuthUser(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthMessage("");
    setAuthMode("login");
    setPreHomeVisible(true);
    try { localStorage.removeItem("firebox-prehome-complete"); } catch {}
    reset();
  };
  const handleOAuth = async (provider) => {
    setAuthBusy(true); setAuthMessage("");
    try {
      const response = await fetch(`/api/auth/${provider}`);
      const data = await response.json().catch(() => ({}));
      if (response.redirected) { window.location.assign(response.url); return; }
      if (!response.ok) throw new Error(data.error || `${provider} sign-in is not configured yet`);
      if (data.url) window.location.assign(data.url);
    } catch (error) { setAuthMessage(error.message); }
    finally { setAuthBusy(false); }
  };
  /* ════════════════════════════════════════════════════════════════════════ */
  if (preHomeVisible) return (
    <>
      <style>{`@keyframes firebox-auth-caret { 0%,45%{opacity:1} 46%,100%{opacity:0} } @keyframes firebox-auth-glow { 0%,100%{opacity:.42;transform:scale(.96)} 50%{opacity:.8;transform:scale(1.04)} }`}</style>
      <div style={{ minHeight:"100vh", width:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:isMobile ? 18 : 32, background:palette.editorBg, color:palette.text, fontFamily:FONT_UI, position:"relative", overflow:"auto" }}>
        <div style={{ position:"absolute", inset:"12% 18% auto", height:260, background:"radial-gradient(circle, rgba(0,122,204,.16), transparent 68%)", filter:"blur(30px)", pointerEvents:"none", animation:"firebox-auth-glow 5s ease-in-out infinite" }}/>
        <div style={{ width:"min(460px, 100%)", position:"relative", zIndex:1 }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:18 }}><FireboxAgentMark size={68} animated/></div>
          <div style={{ textAlign:"center", marginBottom:22 }}>
            <div style={{ fontSize:isMobile ? 27 : 34, fontWeight:750, letterSpacing:"-0.04em", color:palette.textActive, minHeight:42 }}>{preHomeTypewriter}<span style={{ display:"inline-block", width:2, height:"1em", marginLeft:3, verticalAlign:"-0.12em", background:palette.accent, animation:"firebox-auth-caret 1s steps(1) infinite" }}/></div>
            <div style={{ marginTop:9, color:palette.textMuted, fontSize:13, lineHeight:1.6 }}>Your autonomous coding workbench for turning ideas and existing projects into working software.</div>
          </div>
          <div style={{ padding:isMobile ? 20 : 26, border:`1px solid ${palette.border}`, borderRadius:16, background:palette.panelBg, boxShadow:"0 24px 80px rgba(0,0,0,.28)" }}>
            <div style={{ textAlign:"center", marginBottom:18 }}><div style={{ fontSize:17, fontWeight:700, color:palette.textActive }}>{authMode === "register" ? "Create your Firebox account" : "Welcome to Firebox"}</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:5 }}>{authMode === "register" ? "Start building with your own workspace." : "Sign in to continue to your workspace."}</div></div>
            <div style={{ display:"grid", gap:8 }}>
              <button type="button" disabled={authBusy} onClick={() => handleOAuth("google")} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:9, padding:"10px 12px", border:`1px solid ${palette.border}`, borderRadius:8, background:palette.editorBg, color:palette.text, cursor:"pointer", fontFamily:FONT_UI, fontSize:12, fontWeight:600 }}><span style={{ width:18, height:18, display:"grid", placeItems:"center", borderRadius:4, background:"#fff", color:"#4285F4", fontWeight:800, fontSize:13 }}>G</span> Continue with Google</button>
              <button type="button" disabled={authBusy} onClick={() => handleOAuth("github")} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:9, padding:"10px 12px", border:`1px solid ${palette.border}`, borderRadius:8, background:palette.editorBg, color:palette.text, cursor:"pointer", fontFamily:FONT_UI, fontSize:12, fontWeight:600 }}><Github size={17}/> Continue with GitHub</button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, margin:"17px 0", color:palette.textFaint, fontSize:10 }}><span style={{ flex:1, height:1, background:palette.border }}/><span>OR CONTINUE WITH EMAIL</span><span style={{ flex:1, height:1, background:palette.border }}/></div>
            <form onSubmit={submitAuth} style={{ display:"grid", gap:10 }}>
              <input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email address" autoComplete="email" style={{ width:"100%", boxSizing:"border-box", padding:"11px 12px", border:`1px solid ${palette.border}`, borderRadius:8, background:palette.editorBg, color:palette.text, outline:"none", fontFamily:FONT_UI, fontSize:12 }}/>
              <input type="password" required minLength={8} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password (8+ characters)" autoComplete={authMode === "register" ? "new-password" : "current-password"} style={{ width:"100%", boxSizing:"border-box", padding:"11px 12px", border:`1px solid ${palette.border}`, borderRadius:8, background:palette.editorBg, color:palette.text, outline:"none", fontFamily:FONT_UI, fontSize:12 }}/>
              <button type="submit" disabled={authBusy} style={{ width:"100%", padding:"11px 12px", marginTop:2, border:"none", borderRadius:8, background:palette.accent, color:"#fff", cursor:authBusy ? "wait" : "pointer", fontFamily:FONT_UI, fontSize:12, fontWeight:700 }}>{authBusy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}</button>
            </form>
            {authMessage && <div style={{ marginTop:12, padding:"9px 10px", border:`1px solid ${palette.error}55`, borderRadius:7, background:`${palette.error}12`, color:palette.error, fontSize:11, lineHeight:1.45 }}>{authMessage}</div>}
            <div style={{ textAlign:"center", marginTop:15, color:palette.textMuted, fontSize:11 }}>{authMode === "register" ? "Already have an account?" : "New to Firebox?"} <button type="button" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setAuthMessage(""); }} style={{ border:"none", background:"transparent", color:palette.accent, cursor:"pointer", fontSize:11, fontWeight:700 }}>{authMode === "register" ? "Sign in" : "Create an account"}</button></div>
          </div>
          <button type="button" onClick={continueAsGuest} style={{ display:"block", margin:"16px auto 0", border:"none", background:"transparent", color:palette.textMuted, cursor:"pointer", fontFamily:FONT_UI, fontSize:11 }}>Get started without signing in</button>
        </div>
      </div>
    </>
  );
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
        @keyframes fireboxMarkPulse { 0%,100%{transform:scale(1);filter:drop-shadow(0 0 2px rgba(56,189,248,0.12))} 42%{transform:scale(1.055);filter:drop-shadow(0 0 14px rgba(56,189,248,0.45))} 70%{transform:scale(0.99)} }
        @keyframes fireboxMarkOrbit { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fireboxMarkHalo { 0%,100%{opacity:0.34;stroke-width:1} 50%{opacity:0.92;stroke-width:1.8} }
        @keyframes fireboxMarkCore { 0%,100%{transform:scale(0.94);opacity:0.72} 50%{transform:scale(1.12);opacity:1} }
        .firebox-agent-mark.is-animated { animation:fireboxMarkPulse 1.9s cubic-bezier(.45,0,.2,1) infinite; transform-origin:center; }
        .firebox-agent-mark.is-animated .firebox-agent-orbit { animation:fireboxMarkOrbit 2.7s linear infinite; transform-origin:32px 32px; transform-box:fill-box; }
        .firebox-agent-mark.is-animated .firebox-agent-halo { animation:fireboxMarkHalo 1.9s ease-in-out infinite; }
        .firebox-agent-mark.is-animated .firebox-agent-core { animation:fireboxMarkCore 1.9s ease-in-out infinite; transform-origin:32px 35px; transform-box:fill-box; }
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

      <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:palette.editorBg, fontFamily:FONT_UI, color:palette.text, overflow:"hidden" }}>

        {/* ══ Title bar ═══════════════════════════════════════════════════ */}
        <div style={{
          height: isMobile ? 44 : 30, flexShrink:0, background:palette.titleBar,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding: isMobile ? "0 10px" : "0 12px",
          borderBottom:`1px solid ${palette.border}`, WebkitAppRegion:"drag",
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
                border:`1px solid ${sideOpen ? palette.accent : palette.border}`,
                borderRadius:6, cursor:"pointer", WebkitAppRegion:"no-drag", flexShrink:0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sideOpen ? palette.accent : palette.textMuted} strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}
          {/* Title */}
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:palette.textMuted, flex: isMobile ? 1 : "unset", justifyContent: isMobile ? "center" : "unset", marginLeft: isMobile ? 0 : 0 }}>
            <FireboxAgentMark size={16}/>
            <span style={{ color:palette.text, fontWeight:500, fontSize: isMobile ? 13 : 12 }}>Firebox AI Studio</span>
            {!isMobile && activeFile && (
              <>
                <span style={{ color:palette.textFaint }}>—</span>
                <span>{activeFile.path.split("/").pop()}</span>
              </>
            )}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 6 : 8, WebkitAppRegion:"no-drag" }}>
            {phase !== "idle" && (
              <button onClick={reset} style={{
                display:"flex", alignItems:"center", gap:5, padding: isMobile ? "4px 8px" : "2px 8px",
                background:"transparent", border:`1px solid ${palette.border}`,
                color:palette.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
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
                  background: newProjOpen ? palette.accent : "rgba(0,120,212,0.15)",
                  border:`1px solid ${newProjOpen ? palette.accent : "rgba(0,120,212,0.4)"}`,
                  color: newProjOpen ? "#fff" : palette.accent,
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
                  width:200, background:palette.sideBar,
                  border:`1px solid ${palette.border}`, borderRadius:8,
                  boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
                  overflow:"hidden", animation:"fadeIn 0.12s ease",
                }}>
                  <div style={{ padding:"8px 12px 5px", fontSize:10, fontWeight:700, color:palette.textMuted, letterSpacing:"0.08em" }}>CREATE NEW</div>
                  <button
                    onClick={() => { setNewProjOpen(false); reset(); setActivity("home"); setSideOpen(false); }}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"9px 12px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left" }}
                    onMouseEnter={e => e.currentTarget.style.background="#2A2D2E"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}
                  >
                    <div style={{ width:28, height:28, borderRadius:6, background:"rgba(0,122,204,0.12)", border:`1px solid rgba(0,122,204,0.35)`, display:"flex", alignItems:"center", justifyContent:"center" }}><Plus size={13} color={palette.accent}/></div>
                    <div><div style={{ fontSize:12, color:palette.text, fontWeight:600 }}>Start with an idea</div><div style={{ fontSize:10, color:palette.textFaint, marginTop:1 }}>Build a new application</div></div>
                  </button>
                  <div style={{ margin:"4px 12px", borderTop:`1px solid ${palette.border}` }}/>
                  <div style={{ padding:"5px 12px", fontSize:10, fontWeight:700, color:palette.textMuted, letterSpacing:"0.08em" }}>IMPORT EXISTING</div>
                  {[
                    { Icon:Github, label:"GitHub Repository", sub:"Connect, choose a branch, import", action:importGithub },
                    { Icon:Upload, label:"Upload ZIP", sub:"Drop or browse a .zip project", action:importZip },
                    { Icon:FolderOpen, label:"Local Folder", sub:"Open a local directory", action:importFolder },
                  ].map(({ Icon, label, sub, action }) => (
                    <button key={label} onClick={action} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"9px 12px", background:"transparent", border:"none", cursor:"pointer", textAlign:"left" }} onMouseEnter={e => e.currentTarget.style.background="#2A2D2E"} onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                      <div style={{ width:28, height:28, borderRadius:6, flexShrink:0, background:"rgba(255,255,255,0.05)", border:`1px solid ${palette.border}`, display:"flex", alignItems:"center", justifyContent:"center" }}><Icon size={13} color={palette.textMuted}/></div>
                      <div><div style={{ fontSize:12, color:palette.text, fontWeight:500 }}>{label}</div><div style={{ fontSize:10, color:palette.textFaint, marginTop:1 }}>{sub}</div></div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isMobile && (
              <button onClick={() => { setActivity("explorer"); setSideOpen(false); setExplorerOpen(p => !p); }} title={explorerOpen ? "Hide Explorer" : "Show Explorer"} style={{
                display:"flex", alignItems:"center", gap:5, padding:"2px 8px",
                background:explorerOpen ? "#3D3D3D" : "transparent",
                border:`1px solid ${explorerOpen ? palette.accent : palette.border}`,
                color:explorerOpen ? palette.accent : palette.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
              }}>
                <PanelLeftOpen size={11} style={{ transform:"rotate(180deg)" }}/><span>Explorer</span>
              </button>
            )}
            <button onClick={() => setHistoryOpen(p=>!p)} style={{
              display:"flex", alignItems:"center", gap:5, padding: isMobile ? "4px 8px" : "2px 8px",
              background: historyOpen ? "#3D3D3D" : "transparent",
              border:`1px solid ${palette.border}`,
              color:palette.textMuted, fontSize:11, borderRadius:4, cursor:"pointer",
            }}>
              <History size={11}/>{!isMobile && " History"}
            </button>
          </div>
        </div>

        {/* History dropdown */}
        {historyOpen && (
          <div style={{ background:palette.sideBar, borderBottom:`1px solid ${palette.border}`, padding:"10px 14px", animation:"fadeIn 0.15s", zIndex:50 }}>
            <div style={{ fontSize:10, color:palette.textMuted, marginBottom:6, fontWeight:700, letterSpacing:"0.1em" }}>RECENT BUILDS</div>
            {recentBuilds.length === 0
              ? <div style={{ fontSize:12, color:palette.textFaint }}>No builds yet.</div>
              : recentBuilds.map(b => (
                <div key={b._id} className="hist-row" style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"5px 8px", borderRadius:4, animation:"fadeIn 0.15s", cursor:"default",
                }}>
                  <span style={{ fontSize:12, color:palette.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{b.description}</span>
                  <span style={{ fontSize:11, color: b.status==="complete"?palette.success:b.status==="failed"?palette.error:palette.textMuted, marginLeft:10, flexShrink:0 }}>{b.status}</span>
                  <span style={{ fontSize:11, color:palette.textFaint, marginLeft:10, flexShrink:0 }}>{new Date(b.createdAt).toLocaleDateString()}</span>
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
                  position:"absolute", top:0, left:0, bottom:0, zIndex:180,
                  width:sideOpen ? 218 : 48, flexShrink:0, background:palette.activityBar,
                  borderRight:`1px solid ${palette.border}`, display:"flex", flexDirection:"column",
                  overflow:"hidden", transition:"width 0.2s ease",
                }}>
                  <button
                    className="act-btn"
                    title={sideOpen ? "Collapse sidebar" : "Open sidebar"}
                    onClick={() => setSideOpen(p => !p)}
                    style={{
                      display:"flex", alignItems:"center", justifyContent:sideOpen ? "flex-end" : "center",
                      width:"100%", height:44, padding:sideOpen ? "0 14px" : 0,
                      background:"transparent", border:"none", borderBottom:`1px solid ${palette.border}`,
                      color:palette.textMuted, cursor:"pointer", flexShrink:0,
                    }}
                  >
                    {sideOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
                  </button>
                  <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", paddingTop:6 }}>
                    {navItems.map(({ id, Icon, title, badge, badgeColor }) => (
                      <button
                        key={id}
                        className="act-btn"
                        title={title}
                        onClick={() => { if (id === "home") { reset(); setActivity("home"); setSideOpen(true); } else if (id === "agents") { setActivity("agents"); setSideOpen(true); } else if (id === "workspace") { setActivity("workspace"); setSideOpen(false); } else { setActivity(id); setSideOpen(true); } }}
                        style={{
                          position:"relative", display:"flex", flexDirection:"row", alignItems:"center",
                          justifyContent:sideOpen ? "flex-start" : "center", gap:sideOpen ? 11 : 0,
                          width:"100%", height:44, padding:sideOpen ? "0 14px" : 0,
                          background:activity===id ? "rgba(0,120,212,0.08)" : "transparent", border:"none",
                          borderLeft:`2px solid ${activity===id ? palette.accent : "transparent"}`,
                          color:activity===id ? palette.textActive : palette.textMuted, cursor:"pointer", flexShrink:0,
                        }}
                      >
                        <Icon size={19}/>
                        {sideOpen && <span style={{ fontSize:12, fontWeight:activity===id ? 600 : 500, whiteSpace:"nowrap" }}>{title}</span>}
                        {badge && <span style={{ position:sideOpen ? "static" : "absolute", top:6, right:5, marginLeft:sideOpen ? "auto" : 0, minWidth:14, height:14, borderRadius:7, background:badgeColor || palette.accent, color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>{typeof badge === "number" ? badge : null}</span>}
                      </button>
                    ))}
                  </div>
                  <button className="act-btn" title="Settings" onClick={() => { setActivity("settings"); setSideOpen(true); }} style={{
                    display:"flex", flexDirection:"row", alignItems:"center", justifyContent:sideOpen ? "flex-start" : "center", gap:sideOpen ? 11 : 0,
                    width:"100%", height:44, padding:sideOpen ? "0 14px" : 0, background:activity === "settings" ? "rgba(0,120,212,0.08)" : "transparent", border:"none", borderLeft:`2px solid ${activity === "settings" ? palette.accent : "transparent"}`, color:activity === "settings" ? palette.textActive : palette.textMuted, cursor:"pointer", flexShrink:0,
                  }}>
                    <Settings size={19}/>{sideOpen && <span style={{ fontSize:12, fontWeight:activity === "settings" ? 600 : 500 }}>Settings</span>}
                  </button>
                </div>
              );
            }
            return (
              <div style={{
                width:navExpanded ? 176 : 48, flexShrink:0, background:palette.activityBar,
                borderRight:`1px solid ${palette.border}`,
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
                    background:"transparent", border:"none", color:palette.textMuted, cursor:"pointer",
                  }}
                >
                  {navExpanded ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
                </button>
                {navItems.map(({ id, Icon, title, badge, badgeColor }) => (
                  <button
                    key={id}
                    className="act-btn"
                    title={title}
                    onClick={() => { if (id === "home") { reset(); setActivity("home"); setSideOpen(false); setExplorerOpen(false); } else if (id === "agents") { setActivity("agents"); setSideOpen(false); setExplorerOpen(false); } else if (id === "workspace") { setActivity("workspace"); setSideOpen(false); setExplorerOpen(false); } else if (id === "explorer") { setActivity("explorer"); setSideOpen(false); setExplorerOpen(p => !p); } else { setActivity(id); setSideOpen(p => activity===id ? !p : true); setExplorerOpen(false); } }}
                    style={{
                      position:"relative", display:"flex", flexDirection:"row", alignItems:"center", justifyContent:navExpanded ? "flex-start" : "center",
                      gap:navExpanded ? 11 : 0, width:"100%", height:44, padding:navExpanded ? "0 14px" : 0,
                      background:activity===id ? "rgba(0,120,212,0.08)" : "transparent", border:"none",
                      borderLeft:`2px solid ${activity===id ? palette.accent : "transparent"}`,
                      color: activity===id ? palette.textActive : palette.textMuted,
                      cursor:"pointer", transition:"color 0.15s, background 0.15s",
                    }}
                  >
                    <Icon size={20}/>
                    {navExpanded && <span style={{ fontSize:12, fontWeight:activity===id ? 600 : 500 }}>{title}</span>}
                    {badge && (
                      <span style={{
                        position:navExpanded ? "static" : "absolute", top:6, right:6, minWidth:14, height:14, borderRadius:7,
                        marginLeft:navExpanded ? "auto" : 0,
                        background: badgeColor || palette.accent, color:"#fff",
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
                  borderLeft:`2px solid ${activity === "settings" ? palette.accent : "transparent"}`, color: activity === "settings" ? palette.textActive : palette.textMuted, cursor:"pointer", marginBottom:4,
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
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    APPEARANCE
                  </div>
                  <div style={{ padding:"4px 12px 14px", borderBottom:`1px solid ${palette.border}` }}>
                    <button onClick={() => setIsLightMode(prev => !prev)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"10px 11px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.panelBg, color:palette.text, cursor:"pointer", fontFamily:FONT_UI }}>
                      <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                        {isLightMode ? <Sun size={15} color={palette.accent}/> : <Moon size={15} color={palette.accent}/>}<span style={{ fontSize:11, fontWeight:650 }}>{isLightMode ? "Light Mode" : "Dark Mode"}</span>
                      </span>
                      <span style={{ fontSize:10, color:palette.textMuted }}>Switch to {isLightMode ? "dark" : "light"}</span>
                    </button>
                  </div>
                  <div style={{ padding:"10px 12px 12px", borderBottom:`1px solid ${palette.border}` }}>
                    <button onClick={logout} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"9px 11px", border:`1px solid ${palette.error}66`, borderRadius:7, background:`${palette.error}10`, color:palette.error, cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:650 }}>
                      <LogOut size={14}/> Log out{authUser?.email ? ` (${authUser.email})` : ""}
                    </button>
                  </div>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    PROVIDER SETTINGS
                  </div>
                  <div style={{ flex:1, overflowY:"auto", padding:"4px 12px 18px" }}>
                    <div style={{ fontSize:12, color:palette.text, lineHeight:1.5, marginBottom:14 }}>
                      Choose which model responds to Firebox requests. Cloud AI stays available as the default provider.
                    </div>

                    <div style={{ fontSize:10, color:palette.textMuted, fontWeight:700, letterSpacing:"0.08em", marginBottom:6 }}>AI PROVIDER</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:16 }}>
                      {[{ id:"cloud", label:"Cloud AI" }, { id:"local", label:"Local AI" }, { id:"openai", label:"OpenAI" }, { id:"anthropic", label:"Anthropic" }, { id:"google", label:"Gemini" }, { id:"openrouter", label:"OpenRouter" }].map(({ id, label }) => (
                        <button
                          key={id}
                          onClick={() => { setAiProvider(id); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          style={{
                            padding:"9px 8px", borderRadius:5, cursor:"pointer", fontFamily:FONT_UI,
                            border:`1px solid ${aiProvider === id ? palette.accent : palette.border}`,
                            background: aiProvider === id ? "rgba(0,120,212,0.18)" : "transparent",
                            color: aiProvider === id ? palette.textActive : palette.textMuted,
                            fontSize:11, fontWeight:600,
                          }}
                        >{label}</button>
                      ))}
                    </div>

                    {aiProvider !== "cloud" && (
                      <>
                        <label style={{ display:"block", fontSize:10, color:palette.textMuted, fontWeight:700, marginBottom:5 }}>
                          {aiProvider === "local" ? "OLLAMA / OPENAI-COMPATIBLE ENDPOINT" : `${aiProvider.toUpperCase()} API ENDPOINT`}
                        </label>
                        <input
                          value={localAiEndpoint}
                          onChange={e => { setLocalAiEndpoint(e.target.value); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          placeholder={aiProvider === "local" ? "http://127.0.0.1:11434/v1" : "Provider default endpoint"}
                          spellCheck="false"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:palette.editorBg, border:`1px solid ${palette.border}`, borderRadius:4, color:palette.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:palette.textMuted, fontWeight:700, marginBottom:5 }}>
                          MODEL IDENTIFIER
                        </label>
                        <input
                          value={localAiModel}
                          onChange={e => { setLocalAiModel(e.target.value); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          placeholder={aiProvider === "local" ? "Enter any compatible local model" : "Enter provider model identifier"}
                          spellCheck="false"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:palette.editorBg, border:`1px solid ${palette.border}`, borderRadius:4, color:palette.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:palette.textMuted, fontWeight:700, marginBottom:5 }}>
                          OPTIONAL API KEY
                        </label>
                        <input
                          type="password"
                          value={localAiApiKey}
                          onChange={e => { setLocalAiApiKey(e.target.value); setLocalAiTestState("idle"); setLocalAiTestMessage(""); }}
                          placeholder="Leave blank if not required"
                          autoComplete="off"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:palette.editorBg, border:`1px solid ${palette.border}`, borderRadius:4, color:palette.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        {aiProvider === "local" && <>
                        <label style={{ display:"block", fontSize:10, color:palette.textMuted, fontWeight:700, marginBottom:5 }}>
                          LOCAL FIREBOX ENGINE URL
                        </label>
                        <input
                          value={localEngineUrl}
                          onChange={e => setLocalEngineUrl(e.target.value)}
                          placeholder="http://127.0.0.1:8787"
                          spellCheck="false"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:palette.editorBg, border:`1px solid ${palette.border}`, borderRadius:4, color:palette.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        <label style={{ display:"block", fontSize:10, color:palette.textMuted, fontWeight:700, marginBottom:5 }}>
                          LOCAL ENGINE PAIRING TOKEN
                        </label>
                        <input
                          type="password"
                          value={localEngineToken}
                          onChange={e => setLocalEngineToken(e.target.value)}
                          placeholder="Token from the Windows Local Engine"
                          autoComplete="off"
                          style={{ width:"100%", boxSizing:"border-box", padding:"8px 9px", marginBottom:12, background:palette.editorBg, border:`1px solid ${palette.border}`, borderRadius:4, color:palette.text, fontFamily:FONT_MONO, fontSize:11, outline:"none" }}
                        />

                        </>}

                        <button
                          onClick={testLocalAi}
                          disabled={localAiTestState === "testing"}
                          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"8px 10px", borderRadius:4, border:`1px solid ${palette.borderLight}`, background:localAiTestState === "testing" ? "rgba(255,255,255,0.05)" : palette.activityBar, color:palette.text, cursor:localAiTestState === "testing" ? "wait" : "pointer", fontSize:11, fontWeight:600 }}
                        >
                          {localAiTestState === "testing" ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <Zap size={13}/>} Test {aiProvider === "local" ? "Local AI" : aiProvider}
                        </button>

                        {aiProvider === "local" && <button
                          onClick={testLocalEngine}
                          disabled={localAiTestState === "testing"}
                          style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:7, padding:"8px 10px", marginTop:7, borderRadius:4, border:`1px solid ${palette.borderLight}`, background:palette.activityBar, color:palette.text, cursor:localAiTestState === "testing" ? "wait" : "pointer", fontSize:11, fontWeight:600 }}
                        >
                          <Server size={13}/> Test Local Engine
                        </button>}


                        {localAiTestState !== "idle" && (
                          <div style={{ marginTop:9, padding:"8px 9px", borderRadius:4, fontSize:10, lineHeight:1.45, color:localAiTestState === "success" ? palette.success : localAiTestState === "error" ? palette.error : palette.textMuted, background:"rgba(255,255,255,0.04)", border:`1px solid ${localAiTestState === "success" ? "rgba(78,201,148,0.35)" : localAiTestState === "error" ? "rgba(244,135,113,0.35)" : palette.border}` }}>
                            {localAiTestState === "success" ? "Connection works: " : localAiTestState === "error" ? "Connection failed: " : "Testing…"}{localAiTestMessage}
                          </div>
                        )}

                        <div style={{ marginTop:14, fontSize:10, color:palette.textFaint, lineHeight:1.5 }}>
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
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    EXPLORER
                  </div>
                  <div style={{ flex:1, overflowY:"auto" }}>
                    {allFiles.length === 0 ? (
                      <div style={{ padding:"20px 16px", fontSize:12, color:palette.textFaint, lineHeight:1.6 }}>
                        Files will appear here as agents complete their work.
                      </div>
                    ) : (
                      <>
                        {/* Project root */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", fontSize:12, color:palette.text, fontWeight:600 }}>
                          <ChevronDown size={13} color={palette.textMuted}/>
                          <Zap size={13} color={palette.accent}/>
                          <span>firebox-project</span>
                        </div>
                        {/* Per-agent groups */}
                        {Object.entries(filesByAgent).map(([agentName, agentFiles]) => {
                          const meta = AGENT_META.find(a => a.name === agentName);
                          const Icon = meta?.Icon || (agentName === "GitHub Import" ? GitBranch : FolderOpen);
                          const color = meta?.color || palette.accent;
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
                                {isOpen ? <ChevronDown size={12} color={palette.textMuted}/> : <ChevronRight size={12} color={palette.textMuted}/>}
                                <Icon size={13} color={color}/>
                                <span style={{ fontSize:12, color:palette.textMuted, fontWeight:500 }}>{agentName}</span>
                                <span style={{ fontSize:11, color:palette.textFaint, marginLeft:"auto", paddingRight:8 }}>{agentFiles.length}</span>
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
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>AGENT PIPELINE</span>
                    {phase !== "idle" && (
                      <span style={{ fontSize:10, color: phase==="complete" ? palette.success : palette.textMuted, fontWeight:500, letterSpacing:0 }}>
                        {phase==="complete" ? `✓ ${doneCount}/${AGENT_META.length} done` : `${doneCount}/${AGENT_META.length}`}
                      </span>
                    )}
                  </div>

                  {/* Thin progress bar */}
                  {phase !== "idle" && (
                    <div style={{ height:2, background:"rgba(255,255,255,0.06)", flexShrink:0, margin:"0 12px 2px" }}>
                      <div style={{
                        height:"100%", borderRadius:1, transition:"width 0.5s ease",
                        background: phase==="complete" ? palette.success : palette.accent,
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
                          <Sparkles size={14} color={palette.accent} style={{ opacity:0.85 }}/>
                          <span style={{ fontSize:12, fontWeight:700, color:palette.textActive }}>
                            What would you like to build?
                          </span>
                        </div>
                        <div style={{
                          display:"grid",
                          gridTemplateColumns:"1fr 1fr",
                          gap:7,
                        }}>
                          {PROMPT_SUGGESTIONS.map(({ Icon, label, prompt }) => (
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
                              <span style={{ width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:7, background:`${palette.accent}14`, color:palette.accent }}><Icon size={16}/></span>
                              <span style={{ fontSize:11, fontWeight:600, color:palette.textActive, lineHeight:1.3 }}>
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize:10, color:palette.textFaint, marginTop:12, textAlign:"center", lineHeight:1.6 }}>
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
                          <div style={{ fontSize:10, color:palette.textFaint, marginBottom:3, paddingRight:2 }}>
                            💬 You
                          </div>
                          <div style={{
                            maxWidth:"90%", padding:"8px 12px", borderRadius:"10px 10px 2px 10px",
                            background: palette.accent, color:"#fff",
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
                          <div style={{ fontSize:10, color:palette.textFaint, marginBottom:3, paddingLeft:2 }}>
                            ⚡ Firebox AI
                          </div>
                          <div style={{
                            maxWidth:"92%", padding:"8px 12px", borderRadius:"10px 10px 10px 2px",
                            background:"rgba(255,255,255,0.06)",
                            border:"1px solid rgba(255,255,255,0.09)",
                            color: palette.text,
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
                        <div style={{ fontSize:10, color:palette.textFaint, marginBottom:3, paddingLeft:2 }}>
                          ⚡ Firebox AI
                        </div>
                        <div style={{
                          maxWidth:"92%", padding:"8px 12px", borderRadius:"10px 10px 10px 2px",
                          background:"rgba(255,255,255,0.06)",
                          border:"1px solid rgba(0,120,212,0.25)",
                          color: palette.text,
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
                                 ? <FireboxAgentMark size={16} animated state="working"/>
                                 : <Icon size={14} color={isDone ? color : isError ? palette.error : palette.textMuted}/>
                              }
                            </div>

                            {/* Name + subtitle */}
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{
                                  fontSize:13, fontWeight:600,
                                  color: isActive ? palette.textActive : isDone ? palette.text : palette.textMuted,
                                }}>
                                  {name}
                                </span>
                                {isDone && <CheckCircle2 size={13} color={palette.success}/>}
                                {isError && <AlertTriangle size={13} color={palette.error}/>}
                              </div>
                              <div style={{ fontSize:11, marginTop:1 }}>
                                {isDone   && <span style={{ color:palette.textMuted }}>Worked for {elapsed}s</span>}
                                {isActive && <ThinkingDots/>}
                                {isError  && <span style={{ color:palette.error }}>Failed</span>}
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
                                  color:palette.textMuted, fontSize:11, cursor:"pointer",
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
                                    color: i === visCount-1 && isActive ? palette.text : palette.textMuted,
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
                              ? <AlertTriangle size={14} color={palette.error}/>
                              : <CheckCircle2 size={14} color={palette.success}/>
                            }
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color: editError ? palette.error : editingFiles ? "#0078D4" : palette.success }}>
                              {editingFiles ? "Editing files…" : editError ? "Edit failed" : `${editChangedFiles.length} file${editChangedFiles.length !== 1 ? "s" : ""} updated`}
                            </div>
                            <div style={{ fontSize:11, color:palette.textMuted, marginTop:1 }}>
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
                              margin:0, fontSize:10, color:palette.textFaint,
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
                                fontSize:11, color: f.isNew ? "#0078D4" : palette.success,
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
                        <AlertTriangle size={12} color={palette.error} style={{ flexShrink:0, marginTop:1 }}/>
                        <span style={{ fontSize:11, color:palette.error, lineHeight:1.5 }}>{errorMsg}</span>
                      </div>
                    )}

                    {/* Build complete banner */}
                    {phase === "complete" && !aiThinking && !editingFiles && (
                      <div style={{ marginTop:6, padding:"10px 14px", borderRadius:10, background:"rgba(78,201,148,0.08)", border:`1px solid rgba(78,201,148,0.2)`, display:"flex", alignItems:"center", gap:8, animation:"fadeIn 0.3s ease" }}>
                        <CheckCircle2 size={14} color={palette.success}/>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:palette.success }}>Build complete</div>
                          <div style={{ fontSize:11, color:palette.textMuted, marginTop:1 }}>Chat with AI below — ask questions, request changes, or click <strong style={{color:palette.text}}>New project</strong> to start fresh.</div>
                        </div>
                      </div>
                    )}
                  </div>

                </>
              )}

              {/* Panel: Search (placeholder) */}
              {activity === "search" && (
                <div style={{ padding:"10px 12px" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", marginBottom:10 }}>SEARCH</div>
                  <input placeholder="Search" style={{
                    width:"100%", background:"#3C3C3C", border:`1px solid ${palette.border}`,
                    borderRadius:4, padding:"6px 10px", color:palette.text, fontSize:12, outline:"none",
                    fontFamily:FONT_UI,
                  }}/>
                  <div style={{ fontSize:12, color:palette.textFaint, marginTop:12 }}>Search across generated files.</div>
                </div>
              )}

              {/* Panel: Git */}
              {activity === "git" && (
                <>
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>SOURCE CONTROL</span>
                    {gitRepo && (
                      <button
                        onClick={() => { setGitRepo(null); setGitFileShas({}); setGitError(""); setGitPushResult(null); setGitShowPromptStep(false); setGitChangePrompt(""); }}
                        style={{ background:"transparent", border:"none", color:palette.textMuted, cursor:"pointer", padding:2 }} title="Back to repo list">
                        <X size={12}/>
                      </button>
                    )}
                  </div>

                  <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>

                    {/* ── Step 1: Token entry (no saved token) ── */}
                    {!gitRepo && !gitTokenSaved && (
                      <div style={{ padding:"10px 10px 0" }}>
                        <div style={{ fontSize:12, color:palette.textMuted, marginBottom:10, lineHeight:1.6 }}>
                          Enter your GitHub personal access token to see all your repositories.
                        </div>

                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                          <Key size={12} color={palette.textMuted} style={{ flexShrink:0 }}/>
                          <input
                            type="password"
                            value={gitTokenInput}
                            onChange={e => setGitTokenInput(e.target.value)}
                            onKeyDown={e => e.key==="Enter" && saveGitToken()}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            style={{
                              flex:1, background:"#3C3C3C", border:`1px solid ${palette.border}`,
                              borderRadius:4, padding:"5px 8px", color:palette.text,
                              fontSize:12, outline:"none", fontFamily:FONT_MONO,
                            }}
                            onFocus={e => (e.target.style.borderColor=palette.accent)}
                            onBlur={e  => (e.target.style.borderColor=palette.border)}
                          />
                        </div>

                        <button
                          onClick={saveGitToken}
                          disabled={gitTokenSaving || !gitTokenInput.trim()}
                          className="build-btn"
                          style={{
                            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                            width:"100%", padding:"7px", borderRadius:4, border:"none",
                            background: gitTokenInput.trim() ? palette.accent : "#3C3C3C",
                            color:"#fff", fontSize:12, fontWeight:600, cursor: gitTokenInput.trim() ? "pointer" : "not-allowed",
                          }}
                        >
                          {gitTokenSaving
                            ? <><Loader2 size={12} style={{ animation:"spin 1s linear infinite" }}/> Connecting…</>
                            : <><GitBranch size={12}/> Connect GitHub</>}
                        </button>

                        {gitError && (
                          <div style={{ marginTop:8, padding:"6px 8px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:6 }}>
                            <AlertTriangle size={11} color={palette.error} style={{ flexShrink:0, marginTop:1 }}/>
                            <span style={{ fontSize:11, color:palette.error, lineHeight:1.5 }}>{gitError}</span>
                          </div>
                        )}

                        <div style={{ marginTop:10, fontSize:11, color:palette.textFaint, lineHeight:1.6 }}>
                          Generate a token at{" "}
                          <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noreferrer"
                            style={{ color:palette.accent }}>github.com/settings/tokens</a>
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
                            <Search size={11} color={palette.textMuted} style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}/>
                            <input
                              value={gitRepoFilter}
                              onChange={e => setGitRepoFilter(e.target.value)}
                              placeholder="Filter repositories…"
                              style={{
                                width:"100%", background:"#3C3C3C", border:`1px solid ${palette.border}`,
                                borderRadius:4, padding:"5px 8px 5px 24px", color:palette.text,
                                fontSize:12, outline:"none", fontFamily:FONT_UI, boxSizing:"border-box",
                              }}
                              onFocus={e => (e.target.style.borderColor=palette.accent)}
                              onBlur={e  => (e.target.style.borderColor=palette.border)}
                            />
                          </div>
                          <button
                            onClick={() => { setGitReposLoading(true); fetch("/api/git/repos").then(r=>r.json()).then(d=>{ if(Array.isArray(d)) setGitRepos(d); setGitReposLoading(false); }).catch(()=>setGitReposLoading(false)); }}
                            title="Refresh repositories"
                            style={{ background:"transparent", border:"none", color:palette.textMuted, cursor:"pointer", padding:4, flexShrink:0 }}
                          >
                            <RefreshCw size={12}/>
                          </button>
                          <button onClick={removeGitToken} title="Disconnect GitHub account"
                            style={{ background:"transparent", border:"none", color:palette.textMuted, cursor:"pointer", padding:4, flexShrink:0 }}>
                            <X size={12}/>
                          </button>
                        </div>

                        {gitError && (
                          <div style={{ margin:"0 10px 6px", padding:"6px 8px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:6 }}>
                            <AlertTriangle size={11} color={palette.error} style={{ flexShrink:0, marginTop:1 }}/>
                            <span style={{ fontSize:11, color:palette.error, lineHeight:1.5, flex:1 }}>{gitError}</span>
                            <button onClick={() => setGitError("")} style={{ background:"none", border:"none", cursor:"pointer", color:palette.textMuted, padding:0 }}><X size={10}/></button>
                          </div>
                        )}

                        {/* Repos list */}
                        <div style={{ flex:1, overflowY:"auto" }}>
                          {gitReposLoading ? (
                            <div style={{ padding:"20px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                              <Loader2 size={14} color={palette.textMuted} style={{ animation:"spin 1s linear infinite" }}/>
                              <span style={{ fontSize:12, color:palette.textMuted }}>Loading repositories…</span>
                            </div>
                          ) : gitConnecting ? (
                            <div style={{ padding:"20px 10px", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                              <Loader2 size={14} color={palette.textMuted} style={{ animation:"spin 1s linear infinite" }}/>
                              <span style={{ fontSize:12, color:palette.textMuted }}>Connecting…</span>
                            </div>
                          ) : gitRepos.filter(r => !gitRepoFilter || r.fullName.toLowerCase().includes(gitRepoFilter.toLowerCase())).length === 0 ? (
                            <div style={{ padding:"20px 10px", textAlign:"center", fontSize:12, color:palette.textFaint }}>
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
                                    background:"transparent", border:"none", borderBottom:`1px solid ${palette.border}`,
                                    padding:"8px 12px", cursor:"pointer", color:palette.text,
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background="#2A2D2E")}
                                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}
                                >
                                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                                    <GitBranch size={11} color={r.private ? palette.warning : palette.success} style={{ flexShrink:0 }}/>
                                    <span style={{ fontSize:12, fontWeight:600, fontFamily:FONT_MONO, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                      {r.fullName}
                                    </span>
                                    {r.private && (
                                      <span style={{ fontSize:9, background:"#3C3C3C", color:palette.textMuted, padding:"1px 5px", borderRadius:10, flexShrink:0 }}>private</span>
                                    )}
                                  </div>
                                  {r.description && (
                                    <div style={{ fontSize:11, color:palette.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", paddingLeft:17 }}>
                                      {r.description}
                                    </div>
                                  )}
                                  {r.language && (
                                    <div style={{ fontSize:10, color:palette.textFaint, paddingLeft:17, marginTop:1 }}>{r.language}</div>
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
                          <div style={{ padding:"6px 10px 4px", borderBottom:`1px solid ${palette.border}`, flexShrink:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <GitBranch size={12} color={palette.accent}/>
                              <span style={{ fontSize:12, color:palette.textActive, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {gitRepo.fullName}
                              </span>
                              <a href={gitRepo.htmlUrl} target="_blank" rel="noreferrer"
                                style={{ color:palette.textMuted, display:"flex", alignItems:"center" }} title="Open on GitHub">
                                <ExternalLink size={11}/>
                              </a>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                              <span style={{ fontSize:10, color:palette.textMuted }}>branch:</span>
                              <select
                                value={gitRepo.branch}
                                disabled={gitBranchesLoading || gitConnecting || gitImporting}
                                onChange={e => connectGitRepo(gitRepo.fullName, e.target.value)}
                                style={{ flex:1, minWidth:0, background:palette.sideBar, color:palette.success, border:`1px solid ${palette.border}`, borderRadius:4, padding:"2px 5px", fontSize:10, outline:"none" }}
                              >
                                {[...new Set([gitRepo.branch, ...gitBranches].filter(Boolean))].map(branch => <option key={branch} value={branch}>{branch}</option>)}
                              </select>
                              <span style={{ fontSize:10, color:palette.textMuted, whiteSpace:"nowrap" }}>{gitRepo.files.length} files</span>
                            </div>
                          </div>

                          {/* ── "What changes?" prompt step ── */}
                          {gitShowPromptStep && (
                            <div style={{ margin:"8px 8px 0", padding:"10px", borderRadius:6, background:"rgba(0,122,204,0.08)", border:`1px solid rgba(0,122,204,0.3)` }}>
                              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                                <Sparkles size={11} color={palette.accent}/>
                                <span style={{ fontSize:11, fontWeight:700, color:palette.text }}>What would you like to do?</span>
                                <button
                                  onClick={() => setGitShowPromptStep(false)}
                                  style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:palette.textMuted, padding:0 }}
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
                                  background: palette.accent, color:"#fff",
                                  fontSize:12, fontWeight:700,
                                  cursor: (gitImporting || gitAnalyzing) ? "not-allowed" : "pointer",
                                  marginBottom:4, opacity: (gitImporting || gitAnalyzing) ? 0.6 : 1,
                                }}
                              >
                                {gitImporting
                                  ? <><Loader2 size={12} style={{ animation:"spin 1s linear infinite" }}/> Importing…</>
                                  : <><FolderOpen size={12}/> Import as Project</>}
                              </button>
                              <div style={{ fontSize:10, color:palette.textFaint, marginBottom:8, textAlign:"center" }}>
                                Saves repo files as a project — edit anything with AI
                              </div>

                              {/* Analyze with AI Agents — secondary action */}
                              <button
                                onClick={startAnalyzeRepo}
                                disabled={gitAnalyzing || gitImporting}
                                style={{
                                  width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                                  padding:"7px", borderRadius:4, border:`1px solid rgba(0,122,204,0.5)`,
                                  background:"rgba(0,122,204,0.10)", color: palette.accent,
                                  fontSize:11, fontWeight:600,
                                  cursor: (gitAnalyzing || gitImporting) ? "not-allowed" : "pointer",
                                  marginBottom:4, opacity: (gitAnalyzing || gitImporting) ? 0.6 : 1,
                                }}
                              >
                                {gitAnalyzing
                                  ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Analyzing…</>
                                  : <><Brain size={11}/> Analyze with AI Agents</>}
                              </button>
                              <div style={{ fontSize:10, color:palette.textFaint, marginBottom:8, textAlign:"center" }}>
                                7 agents generate a full code review report
                              </div>

                              <div style={{ borderTop:`1px solid ${palette.border}`, marginBottom:8 }}/>

                              <div style={{ fontSize:11, color:palette.textMuted, marginBottom:5, fontWeight:600 }}>Or make targeted changes:</div>
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
                                  width:"100%", background:"#3C3C3C", border:`1px solid ${palette.border}`,
                                  borderRadius:4, padding:"6px 8px", color:palette.text,
                                  fontSize:11, fontFamily:FONT_MONO, resize:"none", outline:"none",
                                  lineHeight:1.6, boxSizing:"border-box",
                                }}
                                onFocus={e => (e.target.style.borderColor=palette.accent)}
                                onBlur={e  => (e.target.style.borderColor=palette.border)}
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
                                    background: gitChangePrompt.trim() ? palette.accent : "#3C3C3C",
                                    color:"#fff", fontSize:11, fontWeight:600,
                                    cursor: gitChangePrompt.trim() ? "pointer" : "not-allowed",
                                  }}
                                >
                                  <Sparkles size={11}/> Apply with AI
                                </button>
                                <button
                                  onClick={() => setGitShowPromptStep(false)}
                                  style={{
                                    padding:"6px 10px", borderRadius:4, border:`1px solid ${palette.border}`,
                                    background:"transparent", color:palette.textMuted, fontSize:11, cursor:"pointer",
                                  }}
                                >
                                  Browse files
                                </button>
                              </div>
                              <div style={{ fontSize:10, color:palette.textFaint, marginTop:5 }}>
                                Ctrl+Enter to confirm · Open a file in the tree, then AI Edit will apply your instruction
                              </div>
                            </div>
                          )}

                          {/* File tree */}
                          <div style={{ flex:1, overflowY:"auto" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", fontSize:12, color:palette.text, fontWeight:600 }}>
                              <ChevronDown size={13} color={palette.textMuted}/>
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
                                <Loader2 size={11} color={palette.textMuted} style={{ animation:"spin 1s linear infinite" }}/>
                                <span style={{ fontSize:11, color:palette.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {gitLoadingFile.split("/").pop()}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* ── Bottom toolbar: AI edit + push ── */}
                          <div style={{ borderTop:`1px solid ${palette.border}`, flexShrink:0, padding:"8px 8px 6px" }}>

                            {/* Error */}
                            {gitError && (
                              <div style={{ marginBottom:6, padding:"5px 8px", borderRadius:4, background:"rgba(244,135,113,0.08)", border:`1px solid rgba(244,135,113,0.25)`, display:"flex", gap:6, alignItems:"flex-start" }}>
                                <AlertTriangle size={11} color={palette.error} style={{ flexShrink:0, marginTop:1 }}/>
                                <span style={{ fontSize:11, color:palette.error, lineHeight:1.5, flex:1 }}>{gitError}</span>
                                <button onClick={() => setGitError("")} style={{ background:"none", border:"none", cursor:"pointer", color:palette.textMuted, padding:0, flexShrink:0 }}>
                                  <X size={10}/>
                                </button>
                              </div>
                            )}

                            {/* Push result */}
                            {gitPushResult && !gitPushResult.error && (
                              <div style={{ marginBottom:6, padding:"5px 8px", borderRadius:4, background:"rgba(78,201,148,0.08)", border:`1px solid rgba(78,201,148,0.25)`, display:"flex", gap:6, alignItems:"center" }}>
                                <CheckCircle2 size={11} color={palette.success}/>
                                <span style={{ fontSize:11, color:palette.success, flex:1 }}>Pushed!</span>
                                {gitPushResult.commitUrl && (
                                  <a href={gitPushResult.commitUrl} target="_blank" rel="noreferrer" style={{ color:palette.success }}>
                                    <ExternalLink size={11}/>
                                  </a>
                                )}
                                <button onClick={() => setGitPushResult(null)} style={{ background:"none", border:"none", cursor:"pointer", color:palette.textMuted, padding:0 }}>
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
                                    background: palette.accent, color:"#fff",
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
                                    background:"rgba(0,122,204,0.1)", color: palette.accent,
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
                                    width:"100%", background:"#3C3C3C", border:`1px solid ${palette.border}`,
                                    borderRadius:4, padding:"6px 8px", color:palette.text,
                                    fontSize:11, fontFamily:FONT_MONO, resize:"none", outline:"none",
                                    lineHeight:1.6,
                                  }}
                                  onFocus={e => (e.target.style.borderColor=palette.accent)}
                                  onBlur={e  => (e.target.style.borderColor=palette.border)}
                                  autoFocus
                                />
                                <div style={{ display:"flex", gap:5, marginTop:4 }}>
                                  <button
                                    onClick={runGitAiEdit}
                                    disabled={gitAiEditing || !gitInstruction.trim() || !activeTabPath}
                                    style={{
                                      flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                                      padding:"5px", borderRadius:4, border:"none",
                                      background: gitInstruction.trim() && activeTabPath ? palette.accent : "#3C3C3C",
                                      color:"#fff", fontSize:11, fontWeight:600, cursor:"pointer",
                                    }}
                                  >
                                    {gitAiEditing
                                      ? <><Loader2 size={11} style={{ animation:"spin 1s linear infinite" }}/> Editing…</>
                                      : <><Sparkles size={11}/> Apply</>}
                                  </button>
                                  <button onClick={() => { setGitAiOpen(false); setGitInstruction(""); }}
                                    style={{ padding:"5px 8px", borderRadius:4, border:`1px solid ${palette.border}`, background:"transparent", color:palette.textMuted, fontSize:11, cursor:"pointer" }}>
                                    Cancel
                                  </button>
                                </div>
                                <div style={{ fontSize:10, color:palette.textFaint, marginTop:3 }}>Ctrl+Enter to apply</div>
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
                                  border:`1px solid ${palette.border}`, borderRadius:4,
                                  padding:"5px 8px", color:palette.text, fontSize:11,
                                  outline:"none", fontFamily:FONT_UI,
                                }}
                                onFocus={e => (e.target.style.borderColor=palette.accent)}
                                onBlur={e  => (e.target.style.borderColor=palette.border)}
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
                                  padding:"6px", borderRadius:4, border:`1px solid ${palette.border}`,
                                  background: gitAiOpen ? "#3C3C3C" : "transparent",
                                  color: activeTabPath ? palette.text : palette.textFaint,
                                  fontSize:11, fontWeight:500, cursor: activeTabPath ? "pointer" : "not-allowed",
                                }}
                              >
                                <Sparkles size={11} color={activeTabPath ? palette.agentColors.Frontend : palette.textFaint}/>
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
                  <div style={{ padding:"8px 12px 6px", fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", flexShrink:0 }}>
                    PROJECTS
                  </div>
                  <div style={{ flex:1, overflowY:"auto" }}>
                    {recentBuilds.length === 0 ? (
                      <div style={{ padding:"20px 16px", fontSize:12, color:palette.textFaint, lineHeight:1.6 }}>
                        No builds yet. Start a build in the AI Agents panel.
                      </div>
                    ) : recentBuilds.map(build => {
                      const isExpanded = expandedProjects.has(build._id);
                      const isLoading  = loadingProjectId === build._id;
                      const files      = projectFilesMap[build._id] || [];
                      const statusColor = build.status === "complete" ? palette.success
                        : build.status === "failed" ? palette.error : palette.textMuted;

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
                              ? <ChevronDown  size={12} color={palette.textMuted}/>
                              : <ChevronRight size={12} color={palette.textMuted}/>}
                            {isExpanded
                              ? <FolderOpen size={14} color="#DCB67A"/>
                              : <Folder     size={14} color="#DCB67A"/>}
                            <span style={{ fontSize:12, color:palette.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {build.description}
                            </span>
                            {isLoading
                              ? <Loader2 size={11} color={palette.textMuted} style={{ animation:"spin 1s linear infinite", flexShrink:0 }}/>
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
                                color:palette.error, cursor:"pointer", flexShrink:0,
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
                              ? <div style={{ paddingLeft:36, paddingBottom:4, fontSize:11, color:palette.textFaint }}>No files.</div>
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
                                    const agColor  = meta?.color || palette.textMuted;
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
                                          {open ? <ChevronDown size={11} color={palette.textMuted}/> : <ChevronRight size={11} color={palette.textMuted}/>}
                                          <AgIcon size={12} color={agColor}/>
                                          <span style={{ fontSize:11, color:palette.textMuted, fontWeight:500 }}>{agentName}</span>
                                          <span style={{ fontSize:10, color:palette.textFaint, marginLeft:"auto", paddingRight:8 }}>{agentFiles.length}</span>
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
                                              fontSize:12, color: activeTabPath === f.path ? palette.textActive : palette.text,
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
                background: palette.sideBar,
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
                      color: phase === "building" ? palette.textFaint : palette.textActive,
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
                          color:palette.textMuted, fontSize:11, fontFamily:FONT_UI,
                          cursor:"pointer", transition:"all 0.15s", flexShrink:0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.3)"; e.currentTarget.style.color=palette.text; }}
                        onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.color=palette.textMuted; }}
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
                          color:palette.textMuted,
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
                        color: chatInput.trim() && phase !== "building" ? "#fff" : palette.textFaint,
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

            const saveProfileSettings = async () => {
              try { localStorage.setItem("firebox-profile-name", profileName.trim()); localStorage.setItem("firebox-autosave", String(workspaceAutoSave)); } catch {}
              setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 1800);
            };
            const settingsPage = (
              <div style={{ flex:1, overflowY:"auto", background:palette.editorBg, color:palette.text, fontFamily:FONT_UI }}>
                <div style={{ width:"100%", maxWidth:1100, margin:"0 auto", padding:isMobile ? "24px 14px 48px" : "38px 34px 64px", boxSizing:"border-box" }}>
                  <div style={{ marginBottom:24 }}><div style={{ color:palette.textActive, fontSize:isMobile ? 25 : 32, fontWeight:700, letterSpacing:"-0.035em" }}>Settings</div><div style={{ color:palette.textMuted, fontSize:12, marginTop:7 }}>Manage your Firebox account, workspace, AI providers, and connected services.</div></div>
                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "190px minmax(0,1fr)", gap:18, alignItems:"start" }}>
                    <div style={{ display:"grid", gap:4, padding:isMobile ? 0 : 6, background:isMobile ? "transparent" : palette.sideBar, border:`1px solid ${isMobile ? "transparent" : palette.border}`, borderRadius:10 }}>
                      {[{id:"profile",label:"Profile",Icon:Home},{id:"security",label:"Security",Icon:ShieldCheck},{id:"appearance",label:"Appearance",Icon:Palette},{id:"providers",label:"AI providers",Icon:Cpu},{id:"workspace",label:"Workspace",Icon:Workflow},{id:"services",label:"Connected services",Icon:Link}].map(({id,label,Icon}) => <button key={id} onClick={() => setSettingsSection(id)} style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 11px", borderRadius:7, border:"none", background:settingsSection===id ? "rgba(0,120,212,.14)" : "transparent", borderLeft:`2px solid ${settingsSection===id ? palette.accent : "transparent"}`, color:settingsSection===id ? palette.textActive : palette.textMuted, cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:settingsSection===id ? 700 : 500, textAlign:"left" }}><Icon size={15}/>{label}</button>)}
                    </div>
                    <div style={{ display:"grid", gap:14 }}>
                      {settingsSection === "profile" && <>
                        <div style={{ padding:20, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:15, fontWeight:700, color:palette.textActive }}>Profile</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:4, marginBottom:18 }}>Personalize how your account appears inside Firebox.</div><div style={{ display:"grid", gap:12 }}><label style={{ fontSize:10, color:palette.textMuted, fontWeight:700 }}>DISPLAY NAME<input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" style={{ display:"block", width:"100%", boxSizing:"border-box", marginTop:6, padding:"10px 11px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.editorBg, color:palette.text, outline:"none", fontFamily:FONT_UI, fontSize:12 }}/></label><label style={{ fontSize:10, color:palette.textMuted, fontWeight:700 }}>EMAIL ADDRESS<input value={authUser?.email || "Guest session"} readOnly style={{ display:"block", width:"100%", boxSizing:"border-box", marginTop:6, padding:"10px 11px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.editorBg, color:palette.textMuted, outline:"none", fontFamily:FONT_UI, fontSize:12 }}/></label><div style={{ display:"flex", justifyContent:"flex-end" }}><button onClick={saveProfileSettings} style={{ padding:"9px 14px", border:"none", borderRadius:7, background:palette.accent, color:"#fff", cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:700 }}>{settingsSaved ? "Saved" : "Save changes"}</button></div></div></div>
                        <div style={{ padding:18, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:12, fontWeight:700, color:palette.textActive }}>Account status</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:6 }}>{authUser ? "Your email account is active and protected by a Firebox session." : "You are using Firebox as a guest. Create an account to persist access across devices."}</div></div>
                      </>}
                      {settingsSection === "security" && <div style={{ padding:20, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:15, fontWeight:700, color:palette.textActive }}>Security</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:4, marginBottom:18 }}>Review your account protection and sign-in methods.</div><div style={{ display:"grid", gap:10 }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:12, border:`1px solid ${palette.border}`, borderRadius:8 }}><div><div style={{ fontSize:12, fontWeight:600, color:palette.text }}>Email and password</div><div style={{ fontSize:10, color:palette.textMuted, marginTop:3 }}>Password is stored as a secure hash.</div></div><CheckCircle2 size={16} color={palette.success}/></div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:12, border:`1px solid ${palette.border}`, borderRadius:8 }}><div><div style={{ fontSize:12, fontWeight:600, color:palette.text }}>Google sign-in</div><div style={{ fontSize:10, color:palette.textMuted, marginTop:3 }}>Connect after OAuth credentials are added in Railway.</div></div><span style={{ fontSize:10, color:palette.textFaint }}>Not connected</span></div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:12, border:`1px solid ${palette.border}`, borderRadius:8 }}><div><div style={{ fontSize:12, fontWeight:600, color:palette.text }}>GitHub sign-in</div><div style={{ fontSize:10, color:palette.textMuted, marginTop:3 }}>Connect after OAuth credentials are added in Railway.</div></div><span style={{ fontSize:10, color:palette.textFaint }}>Not connected</span></div></div></div>}
                      {settingsSection === "appearance" && <div style={{ padding:20, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:15, fontWeight:700, color:palette.textActive }}>Appearance</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:4, marginBottom:18 }}>Choose how Firebox looks across the workbench.</div><button onClick={() => setIsLightMode(prev => !prev)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:13, border:`1px solid ${palette.border}`, borderRadius:8, background:palette.editorBg, color:palette.text, cursor:"pointer" }}><span style={{ display:"flex", alignItems:"center", gap:9, fontSize:12, fontWeight:650 }}>{isLightMode ? <Sun size={16} color={palette.accent}/> : <Moon size={16} color={palette.accent}/>} {isLightMode ? "Light mode" : "Dark mode"}</span><span style={{ fontSize:10, color:palette.textMuted }}>Switch to {isLightMode ? "dark" : "light"}</span></button></div>}
                      {settingsSection === "providers" && <div style={{ padding:20, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:15, fontWeight:700, color:palette.textActive }}>AI providers</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:4, marginBottom:16 }}>Choose the provider used by the Firebox coding agent.</div><div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap:8 }}>{[{id:"cloud",label:"Cloud AI"},{id:"local",label:"Local AI"},{id:"openai",label:"OpenAI"},{id:"anthropic",label:"Anthropic"},{id:"google",label:"Gemini"},{id:"openrouter",label:"OpenRouter"}].map(({id,label}) => <button key={id} onClick={() => { setAiProvider(id); setLocalAiTestState("idle"); }} style={{ padding:"10px 8px", borderRadius:7, border:`1px solid ${aiProvider===id ? palette.accent : palette.border}`, background:aiProvider===id ? "rgba(0,120,212,.14)" : palette.editorBg, color:aiProvider===id ? palette.textActive : palette.textMuted, cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:600 }}>{label}</button>)}</div><div style={{ marginTop:14, padding:12, borderRadius:8, background:palette.editorBg, color:palette.textMuted, fontSize:11, lineHeight:1.5 }}>Current provider: <strong style={{ color:palette.text }}>{aiProvider === "cloud" ? "Cloud AI" : aiProvider}</strong>.</div>{aiProvider !== "cloud" && <div style={{ display:"grid", gap:10, marginTop:12 }}><label style={{ fontSize:10, color:palette.textMuted, fontWeight:700 }}>ENDPOINT<input value={localAiEndpoint} onChange={e => { setLocalAiEndpoint(e.target.value); setLocalAiTestState("idle"); }} placeholder={aiProvider === "local" ? "http://127.0.0.1:11434/v1" : "Provider default endpoint"} style={{ display:"block", width:"100%", boxSizing:"border-box", marginTop:5, padding:"9px 10px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.editorBg, color:palette.text, fontFamily:FONT_MONO, fontSize:11 }}/></label><label style={{ fontSize:10, color:palette.textMuted, fontWeight:700 }}>MODEL IDENTIFIER<input value={localAiModel} onChange={e => { setLocalAiModel(e.target.value); setLocalAiTestState("idle"); }} placeholder="Enter provider model identifier" style={{ display:"block", width:"100%", boxSizing:"border-box", marginTop:5, padding:"9px 10px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.editorBg, color:palette.text, fontFamily:FONT_MONO, fontSize:11 }}/></label><label style={{ fontSize:10, color:palette.textMuted, fontWeight:700 }}>OPTIONAL API KEY<input type="password" value={localAiApiKey} onChange={e => { setLocalAiApiKey(e.target.value); setLocalAiTestState("idle"); }} placeholder="Leave blank if not required" style={{ display:"block", width:"100%", boxSizing:"border-box", marginTop:5, padding:"9px 10px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.editorBg, color:palette.text, fontFamily:FONT_MONO, fontSize:11 }}/></label><button onClick={testLocalAi} disabled={localAiTestState === "testing"} style={{ padding:"9px 11px", border:`1px solid ${palette.border}`, borderRadius:7, background:palette.editorBg, color:palette.text, cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:650 }}>{localAiTestState === "testing" ? "Testing…" : `Test ${aiProvider === "local" ? "Local AI" : aiProvider}`}</button>{localAiTestState !== "idle" && <div style={{ fontSize:10, color:localAiTestState === "success" ? palette.success : palette.error }}>{localAiTestState === "success" ? "Connection works: " : "Connection failed: "}{localAiTestMessage}</div>}</div>}</div>}
                      {settingsSection === "workspace" && <div style={{ padding:20, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:15, fontWeight:700, color:palette.textActive }}>Workspace preferences</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:4, marginBottom:18 }}>Control how Firebox behaves while you work on projects.</div><button onClick={() => setWorkspaceAutoSave(p => !p)} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:13, border:`1px solid ${palette.border}`, borderRadius:8, background:palette.editorBg, color:palette.text, cursor:"pointer" }}><span><span style={{ display:"block", fontSize:12, fontWeight:650 }}>Remember workspace preferences</span><span style={{ display:"block", fontSize:10, color:palette.textMuted, marginTop:4 }}>Keep your editor and launcher choices on this device.</span></span><span style={{ color:workspaceAutoSave ? palette.success : palette.textFaint, fontSize:11, fontWeight:700 }}>{workspaceAutoSave ? "ON" : "OFF"}</span></button><div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}><button onClick={saveProfileSettings} style={{ padding:"9px 14px", border:"none", borderRadius:7, background:palette.accent, color:"#fff", cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:700 }}>{settingsSaved ? "Saved" : "Save preferences"}</button></div></div>}
                      {settingsSection === "services" && <div style={{ padding:20, border:`1px solid ${palette.border}`, borderRadius:12, background:palette.panelBg }}><div style={{ fontSize:15, fontWeight:700, color:palette.textActive }}>Connected services</div><div style={{ fontSize:11, color:palette.textMuted, marginTop:4, marginBottom:18 }}>Manage services Firebox can use for importing and authentication.</div><div style={{ display:"grid", gap:10 }}><div style={{ display:"flex", alignItems:"center", gap:11, padding:13, border:`1px solid ${palette.border}`, borderRadius:8 }}><Github size={18}/><div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:650 }}>GitHub</div><div style={{ fontSize:10, color:palette.textMuted, marginTop:3 }}>Repository import and source control.</div></div><button onClick={() => setActivity("git")} style={{ padding:"7px 10px", border:`1px solid ${palette.border}`, borderRadius:6, background:"transparent", color:palette.textMuted, cursor:"pointer", fontSize:10 }}>Open</button></div><div style={{ display:"flex", alignItems:"center", gap:11, padding:13, border:`1px solid ${palette.border}`, borderRadius:8 }}><Link size={18} color={palette.accent}/><div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:650 }}>Local Firebox Engine</div><div style={{ fontSize:10, color:palette.textMuted, marginTop:3 }}>Optional local build execution service.</div></div><span style={{ fontSize:10, color:localEngineUrl ? palette.success : palette.textFaint }}>{localEngineUrl ? "Configured" : "Not configured"}</span></div></div></div>}
                      <div style={{ padding:18, border:`1px solid ${palette.error}55`, borderRadius:12, background:`${palette.error}08` }}><div style={{ fontSize:12, fontWeight:700, color:palette.error }}>Account actions</div><button onClick={logout} style={{ marginTop:10, display:"flex", alignItems:"center", gap:8, padding:"9px 12px", border:`1px solid ${palette.error}66`, borderRadius:7, background:`${palette.error}12`, color:palette.error, cursor:"pointer", fontFamily:FONT_UI, fontSize:11, fontWeight:700 }}><LogOut size={14}/> Log out</button></div>
                    </div>
                  </div>
                </div>
              </div>
            );
            /* editor inner content — shared by mobile & desktop Panel */
            const editorContent = activity === "settings" ? settingsPage : activity === "home" ? (
              <div style={{ flex:1, overflowY:"auto", background:palette.editorBg, color:palette.text, fontFamily:FONT_UI }}>
                <div style={{ width:"100%", maxWidth:"none", margin:0, padding:isMobile ? "28px 16px 44px" : "42px 18px 60px", boxSizing:"border-box" }}>
                  <div style={{ textAlign:"center", marginBottom:24 }}>
                    <div style={{ color:palette.textActive, fontSize:isMobile ? 25 : 32, fontWeight:650, letterSpacing:"-0.035em" }}>What do you want to build?</div>
                    <div style={{ color:palette.textMuted, fontSize:12, marginTop:8, minHeight:18 }}>{subtitleText || "Describe an idea and Firebox will turn it into a real project."}</div>
                  </div>

                  <div style={{ border:`1px solid ${palette.border}`, borderRadius:10, background:"transparent", padding:"12px 13px 9px", margin:"0 auto 28px", maxWidth:"none" }}>
                    <textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={e => { setTypewriterStopped(true); setChatInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,130)+"px"; }}
                      onFocus={() => setTypewriterStopped(true)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (phase !== "building") sendChatMessage(); } }}
                      placeholder={typewriterText || "Describe what you want to create..."}
                      rows={2}
                      style={{ width:"100%", minHeight:46, maxHeight:130, resize:"none", display:"block", background:"transparent", border:"none", outline:"none", color:palette.textActive, fontFamily:FONT_UI, fontSize:14, lineHeight:1.55 }}
                    />
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginTop:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, color:palette.textMuted, fontSize:11 }}>
                        <button onClick={() => { setActivity("agents"); setSideOpen(true); }} title="Open AI Agents" style={{ width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${palette.border}`, borderRadius:6, background:"transparent", color:palette.textMuted, cursor:"pointer" }}><Plus size={14}/></button>
                        <span style={{ padding:"6px 9px", border:`1px solid ${palette.border}`, borderRadius:6, color:palette.textMuted }}>{aiProvider === "cloud" ? "Cloud AI" : "Local AI"}</span>
                        <span style={{ display:isMobile ? "none" : "inline", color:palette.textFaint }}>Enter to build · Shift+Enter for a new line</span>
                      </div>
                      <button onClick={sendChatMessage} disabled={!chatInput.trim() || phase === "building" || aiThinking} title="Start building" style={{ width:34, height:34, borderRadius:8, border:"none", display:"flex", alignItems:"center", justifyContent:"center",                         background:"transparent", color:chatInput.trim() ? palette.text : palette.textFaint, cursor:chatInput.trim() ? "pointer" : "not-allowed" }}><Send size={15}/></button>
                    </div>
                  </div>

                  <div style={{ maxWidth:"none", margin:"0 auto 22px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, color:palette.textActive, fontSize:12, fontWeight:700 }}><Layers3 size={15} color={palette.accent}/><span>Start with an idea</span></div>
                    <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))", gap:12 }}>
                      {BUILD_LAUNCHER_TYPES.map(({ Icon, label, description, prompt }) => (
                        <button key={label} onClick={() => { setChatInput(prompt); setTimeout(() => chatInputRef.current?.focus(), 80); }} style={{ minHeight:0, aspectRatio:"1 / 1", padding:"20px 16px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, textAlign:"center", border:`1px solid ${palette.border}`, borderRadius:9, background:palette.panelBg, color:palette.text, cursor:"pointer", fontFamily:FONT_UI }}>
                          <Icon size={28} strokeWidth={1.8} color={palette.accent}/><span style={{ fontSize:16, fontWeight:750 }}>{label}</span><span style={{ color:palette.textMuted, fontSize:13, lineHeight:1.5, maxWidth:190 }}>{description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ maxWidth:"none", margin:"0 auto 18px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, color:palette.textActive, fontSize:12, fontWeight:700 }}><Boxes size={15} color={palette.accent}/><span>Build from an existing idea</span></div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                      {BUILD_IDEA_EXAMPLES.map(({ Icon, label, prompt }) => (
                        <button key={label} onClick={() => { setChatInput(prompt); setTimeout(() => chatInputRef.current?.focus(), 80); }} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"9px 14px", border:`1px solid ${palette.border}`, borderRadius:999, background:"transparent", color:palette.textMuted, cursor:"pointer", fontFamily:FONT_UI, fontSize:11 }}><Icon size={15} color={palette.accent}/>{label}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ maxWidth:"none", margin:"0 auto 22px", padding:"11px 13px", border:`1px solid ${palette.border}`, borderRadius:9, background:palette.panelBg }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, color:palette.textMuted, fontSize:11 }}><Bot size={15} color={palette.accent}/><span>Firebox automatically handles architecture, code, database, dependencies, testing, and preview.</span></div>
                      <button onClick={() => setAdvancedOptionsOpen(prev => !prev)} style={{ flexShrink:0, display:"inline-flex", alignItems:"center", gap:5, border:"none", background:"transparent", color:palette.accent, cursor:"pointer", fontFamily:FONT_UI, fontSize:10, fontWeight:700 }}><SlidersHorizontal size={13}/>{advancedOptionsOpen ? "Hide options" : "Advanced options"}<ChevronDown size={12} style={{ transform:advancedOptionsOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }}/></button>
                    </div>
                    {advancedOptionsOpen && <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(3, 1fr)", gap:8, marginTop:12, paddingTop:11, borderTop:`1px solid ${palette.border}` }}>
                      {[ ["Framework", launcherFramework, setLauncherFramework, ["auto","React + Vite","Next.js","Vue"]], ["Package manager", launcherPackageManager, setLauncherPackageManager, ["auto","npm","pnpm","yarn"]], ["Database", launcherDatabase, setLauncherDatabase, ["auto","MongoDB","PostgreSQL","SQLite"]] ].map(([label, value, setter, options]) => <label key={label} style={{ display:"flex", flexDirection:"column", gap:5, color:palette.textMuted, fontSize:10, fontWeight:700 }}>{label}<select value={value} onChange={e => setter(e.target.value)} style={{ padding:"7px 8px", border:`1px solid ${palette.border}`, borderRadius:6, background:palette.editorBg, color:palette.text, fontFamily:FONT_UI, fontSize:10 }}>{options.map(option => <option key={option} value={option}>{option === "auto" ? "Firebox decides" : option}</option>)}</select></label>)}
                    </div>}
                  </div>

                  <div style={{ display:"flex", justifyContent:"center", marginTop:4 }}><button onClick={sendChatMessage} disabled={!chatInput.trim() || phase === "building" || aiThinking} style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 18px", border:"none", borderRadius:8, background:chatInput.trim() ? palette.accent : palette.border, color:chatInput.trim() ? "#fff" : palette.textFaint, cursor:chatInput.trim() ? "pointer" : "not-allowed", fontFamily:FONT_UI, fontSize:12, fontWeight:700 }}><Bot size={15}/>{aiThinking ? "Starting project…" : "Build with AI"}<ChevronRight size={14}/></button></div>

                </div>
              </div>
            ) : activity === "workspace" ? (
              <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", position:"relative", background:palette.editorBg, color:palette.text, fontFamily:FONT_UI }}>
                <div style={{ height:52, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px", borderBottom:`1px solid ${palette.border}`, background:palette.titleBar }}>
                  <div><div style={{ color:palette.textActive, fontSize:18, fontWeight:700 }}>My Workspace</div><div style={{ color:palette.textMuted, fontSize:11, marginTop:3 }}>{workflowStage?.activity || "Follow your agents and inspect generated project files."}</div></div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, color:palette.textMuted, fontSize:11 }}><span style={{ width:7, height:7, borderRadius:"50%", background:phase === "error" ? palette.error : phase === "complete" ? palette.success : palette.accent }}/>{phase === "idle" ? "Ready" : phase === "building" ? "Agents working" : phase === "complete" ? "Complete" : "Needs attention"}{phase === "building" && <><button onClick={() => setBuildExecutionState(buildPaused ? "running" : "paused")} style={{ marginLeft:6, border:`1px solid ${palette.accent}66`, borderRadius:6, background:`${palette.accent}12`, color:palette.accent, padding:"4px 8px", fontSize:10, cursor:"pointer" }}>{buildPaused ? "Resume" : "Pause"}</button><button onClick={stopBuild} style={{ marginLeft:4, border:`1px solid ${palette.error}66`, borderRadius:6, background:`${palette.error}12`, color:palette.error, padding:"4px 8px", fontSize:10, cursor:"pointer" }}>Stop Agent</button></>}</div>
                </div>
                {projectOpenStatus?.phase === "opening" && <div style={{ position:"absolute", inset:0, zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", background:isLightMode ? "rgba(248,250,252,0.96)" : "rgba(24,24,24,0.96)", backdropFilter:"blur(4px)" }}><div style={{ width:"min(420px, calc(100% - 48px))", textAlign:"center", padding:"36px 28px", border:`1px solid ${palette.borderLight}`, borderRadius:16, background:`linear-gradient(145deg, ${palette.panelBg}, ${palette.sideBar})`, boxShadow:"0 18px 60px rgba(0,0,0,0.45)" }}><div style={{ width:"80%", maxWidth:280, aspectRatio:"1", margin:"0 auto 24px", display:"flex", alignItems:"center", justifyContent:"center" }}><FireboxAgentMark size={220} animated state="working"/></div><div style={{ color:palette.textActive, fontSize:17, fontWeight:700 }}>Opening project</div><div style={{ color:palette.textMuted, fontSize:12, marginTop:8 }}>{projectOpenStatus.message}</div><div style={{ color:palette.textFaint, fontSize:10, marginTop:12 }}>Step {(projectOpenStatus.currentStepIndex || 0) + 1} of {projectOpenStatus.steps.length}</div></div></div>}
                {(planning || buildPlan) && <div style={{ flexShrink:0, margin:"10px 14px 0", padding:"12px 14px", border:`1px solid ${palette.accent}66`, borderRadius:9, background:`${palette.accent}0d` }}><div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:8 }}><div style={{ color:palette.textActive, fontSize:12, fontWeight:700 }}>🔥 Firebox Agent plan</div>{planning ? <span style={{ color:palette.accent, fontSize:10 }}>Understanding your request…</span> : <button onClick={() => setBuildPlan(null)} style={{ border:"none", background:"transparent", color:palette.textMuted, cursor:"pointer", fontSize:11 }}>Cancel</button>}</div>{planning ? <div style={{ color:palette.textMuted, fontSize:11 }}>I’ll inspect the request and prepare the build steps before changing the project.</div> : <><div style={{ color:palette.text, fontSize:12, lineHeight:1.5, marginBottom:8 }}>{buildPlan.summary}</div><ol style={{ margin:"0 0 10px 18px", padding:0, color:palette.textMuted, fontSize:11, lineHeight:1.6 }}>{buildPlan.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>{buildPlan.needsConfirmation ? <><div style={{ padding:"8px 10px", borderRadius:7, background:`${palette.warning || "#d7ba7d"}18`, color:palette.textMuted, fontSize:11, marginBottom:8 }}>Confirmation required: {buildPlan.confirmationReason}</div><button onClick={() => confirmBuildPlan(true)} style={{ border:"none", borderRadius:7, background:palette.accent, color:"white", padding:"8px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Confirm and start building →</button></> : <button onClick={() => confirmBuildPlan(false)} style={{ border:"none", borderRadius:7, background:palette.accent, color:"white", padding:"8px 13px", fontSize:11, fontWeight:700, cursor:"pointer" }}>Start building →</button>}</>}</div>}
                <div style={{ flex:1, minHeight:0, display:"grid", gridTemplateColumns:isMobile ? "1fr" : "minmax(250px, 0.34fr) minmax(0, 0.66fr)", gap:0 }}>
                  <div style={{ minHeight:0, display:"flex", flexDirection:"column", borderRight:isMobile ? "none" : `1px solid ${palette.border}`, background:palette.sideBar }}>
                    <div style={{ flexShrink:0, padding:"12px 12px 9px", borderBottom:`1px solid ${palette.border}` }}><div style={{ color:palette.textMuted, fontSize:10, fontWeight:800, letterSpacing:"0.1em", marginBottom:8 }}>CURRENT PROJECT</div><div style={{ display:"flex", alignItems:"center", gap:7, color:palette.text, fontSize:12, fontWeight:700 }}><ChevronDown size={13} color={palette.textMuted}/><FireboxAgentMark size={15}/><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentProjectName}</span></div><div style={{ marginTop:5, color:palette.textFaint, fontSize:10 }}>{projectOpenStatus?.phase === "opening" ? <div style={{ marginTop:8, color:palette.accent, fontSize:10, display:"flex", alignItems:"center", gap:6 }}><FireboxAgentMark size={15} animated state="working"/>{projectOpenStatus.message}</div> : projectOpenStatus?.phase === "error" ? <div style={{ marginTop:8, color:palette.error, fontSize:10 }}>✕ {projectOpenStatus.message}</div> : projectOpenStatus?.phase === "ready" ? <div style={{ marginTop:5, color:palette.success, fontSize:10 }}>● Ready · {currentProjectMeta.fileCount} files{currentProjectMeta.framework ? ` · ${currentProjectMeta.framework}` : ""}</div> : <div style={{ marginTop:5, color:palette.textFaint, fontSize:10 }}>{allFiles.length ? `${allFiles.length} project file${allFiles.length === 1 ? "" : "s"} discovered` : "Waiting for the Agent to inspect the project"}</div>}</div></div>
                     <div style={{ flex:1, minHeight:0, overflowY:"auto", padding:"12px 10px" }}><div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10, color:palette.textActive, fontSize:11, fontWeight:700 }}><FireboxAgentMark size={17} animated={phase === "building" || aiThinking} state={phase === "error" ? "error" : phase === "complete" ? "complete" : "working"}/><span>Firebox Agent</span>{(phase === "building" || aiThinking) && <ThinkingDots/>}</div>{agentStates.every(state => state.status === "idle") && !chatHistory.length && !editingFiles ? <div style={{ padding:"14px 8px", color:palette.textFaint, fontSize:11, lineHeight:1.6 }}>The Agent’s live activity will appear here after you send a request.</div> : <>{chatHistory.filter(message => message.role === "user").slice(-3).map((message, index) => <div key={`request-${index}`} style={{ marginBottom:10, padding:"8px 9px", borderRadius:7, background:"rgba(0,120,212,0.10)", border:"1px solid rgba(0,120,212,0.22)", color:palette.text, fontSize:11, lineHeight:1.45 }}><div style={{ color:palette.textFaint, fontSize:9, marginBottom:3 }}>REQUEST</div>{message.text}</div>)}{AGENT_META.map(({ name, Icon, color }) => { const state = agentStates.find(item => item.name === name); if (!state || state.status === "idle") return null; const active = state.status === "working"; const done = state.status === "done"; const failed = state.status === "error"; const steps = AGENT_STEPS[name] || []; const visible = agentVisSteps[name] || 0; return <div key={name} style={{ marginBottom:8, padding:"8px 9px", borderRadius:7, background:active ? `${color}10` : "rgba(255,255,255,0.025)", border:`1px solid ${active ? `${color}55` : "rgba(255,255,255,0.08)"}` }}><div style={{ display:"flex", alignItems:"center", gap:7 }}><span style={{ color:active ? color : done ? palette.success : failed ? palette.error : palette.textMuted, fontSize:12 }}>{active ? "●" : done ? "✓" : failed ? "✕" : "○"}</span><Icon size={13} color={active ? color : done ? palette.success : failed ? palette.error : palette.textMuted}/><span style={{ color:active ? palette.textActive : palette.text, fontSize:11, fontWeight:650 }}>{active ? "Working" : done ? "Completed" : failed ? "Failed" : "Waiting"}</span><span style={{ color:palette.textMuted, fontSize:10 }}>{name}</span>{active && <ThinkingDots/>}</div>{visible > 0 && <div style={{ marginTop:6, paddingLeft:20 }}>{steps.slice(0, visible).map((step, stepIndex) => <div key={`${name}-${stepIndex}`} style={{ display:"flex", alignItems:"center", gap:6, color:stepIndex === visible - 1 && active ? palette.text : palette.textMuted, fontSize:10, lineHeight:1.45, marginTop:3 }}><span>{step.icon}</span><span>{step.text}</span>{stepIndex === visible - 1 && active && <span style={{ width:4, height:4, borderRadius:"50%", background:color, animation:"pulse 0.9s ease-in-out infinite" }}/>}</div>)}</div>}{state.streaming && <div style={{ marginTop:6, paddingLeft:20, color:palette.textFaint, fontSize:9, lineHeight:1.4, maxHeight:42, overflow:"hidden" }}>{state.streaming.slice(-280)}</div>}</div>})}{(editingFiles || editChangedFiles.length > 0 || editError) && <div style={{ padding:"8px 9px", borderRadius:7, background:"rgba(255,255,255,0.025)", border:`1px solid ${editError ? `${palette.error}55` : `${palette.success}44`}`, color:editError ? palette.error : palette.textMuted, fontSize:10 }}>{editingFiles ? "● Editing files…" : editError ? `✕ ${editError}` : `✓ ${editChangedFiles.length} file${editChangedFiles.length === 1 ? "" : "s"} updated`}</div>}{workflowStage?.activity && <div style={{ marginTop:8, color:palette.textFaint, fontSize:10 }}>● {workflowStage.activity}</div>}</>}</div>
                    <div style={{ flexShrink:0, padding:"10px 10px 12px", borderTop:`1px solid ${palette.border}`, background:palette.titleBar }}>
                      <textarea ref={chatInputRef} value={chatInput} onChange={e => { setChatInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,85)+"px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (phase !== "building") sendChatMessage(); } }} placeholder="Ask anything, describe an app, or request a change…" rows={2} style={{ width:"100%", boxSizing:"border-box", minHeight:52, maxHeight:85, resize:"none", padding:"9px 10px", border:`1px solid ${palette.borderLight}`, borderRadius:8, background:palette.editorBg, color:palette.textActive, fontFamily:FONT_UI, fontSize:11, lineHeight:1.45, outline:"none" }}/>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}><button onClick={() => { setChatInput(""); setTimeout(() => chatInputRef.current?.focus(), 0); }} style={{ border:`1px solid ${palette.border}`, borderRadius:999, background:"transparent", color:palette.textMuted, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>＋ New project</button><button onClick={sendChatMessage} disabled={!chatInput.trim() || phase === "building" || aiThinking} title="Build" style={{ width:28, height:28, border:"none", borderRadius:7, background:chatInput.trim() ? palette.accent : "#38383a", color:chatInput.trim() ? "#fff" : palette.textFaint, display:"flex", alignItems:"center", justifyContent:"center", cursor:chatInput.trim() ? "pointer" : "not-allowed" }}><Send size={13}/></button></div>
                    </div>
                  </div>
                  <div style={{ minWidth:0, minHeight:0, display:"flex", flexDirection:"column", background:palette.editorBg }}>
                    <div style={{ height:36, flexShrink:0, display:"flex", alignItems:"stretch", overflowX:"auto", borderBottom:`1px solid ${palette.border}`, background:palette.tabBar }}>
                      {openTabs.length === 0 ? <div style={{ display:"flex", alignItems:"center", padding:"0 12px", color:palette.textFaint, fontSize:11 }}>No project file selected</div> : openTabs.map(tab => { const isActive = tab.path === activeTabPath; return <button key={tab.path} onClick={() => setActiveTabPath(tab.path)} style={{ display:"flex", alignItems:"center", gap:6, minWidth:110, maxWidth:190, padding:"0 10px", border:"none", borderRight:`1px solid ${palette.border}`, borderTop:`2px solid ${isActive ? palette.accent : "transparent"}`, background:isActive ? palette.activeTab : palette.inactiveTab, color:isActive ? palette.textActive : palette.textMuted, fontFamily:FONT_UI, fontSize:11, cursor:"pointer" }}><FileIcon path={tab.path} size={13}/><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tab.path.split("/").pop()}</span></button>; })}
                    </div>
                    <div style={{ flex:1, minHeight:220 }}>{activeTabPath ? <MonacoEditor height="100%" language={getMonacoLang(activeTabPath)} theme={isLightMode ? "vs" : "firebox-dark"} value={activeContent} onChange={value => { if (activeTabPath) setTabContents(prev => ({ ...prev, [activeTabPath]: value ?? "" })); }} options={{ minimap:{ enabled:false }, fontSize:13, automaticLayout:true, wordWrap:"on", padding:{ top:12 } }} /> : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:palette.textFaint, fontSize:12 }}>Generated files will appear here after an agent opens a project file.</div>}</div>
                  </div>
                </div>
              </div>
            ) : activity === "agents" ? (
              <div style={{ flex:1, overflowY:"auto", background:palette.editorBg, color:palette.text, fontFamily:FONT_UI }}>
                <div style={{ width:"100%", margin:0, padding:isMobile ? "24px 16px 44px" : "30px 20px 58px", boxSizing:"border-box" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:20, marginBottom:28 }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, color:palette.accent, fontSize:11, fontWeight:700, letterSpacing:"0.12em", marginBottom:9 }}><Cpu size={14}/> AI AGENTS</div>
                      <h1 style={{ margin:0, color:palette.textActive, fontSize:isMobile ? 26 : 34, letterSpacing:"-0.035em", fontWeight:700 }}>Choose your AI engine</h1>
                      <p style={{ margin:"9px 0 0", color:palette.textMuted, fontSize:13, lineHeight:1.65 }}>Select the AI provider that will power your Firebox Agent.<br/>One Firebox Agent handles the complete development workflow through these capabilities.</p>
                    </div>
                    <div style={{ display:isMobile ? "none" : "flex", alignItems:"center", gap:8, padding:"8px 11px", border:`1px solid ${palette.border}`, borderRadius:8, color:palette.textMuted, fontSize:11 }}>
                      <span style={{ width:7, height:7, borderRadius:"50%", background:phase === "error" ? palette.error : phase === "complete" ? palette.success : palette.accent, boxShadow:`0 0 8px ${phase === "error" ? palette.error : palette.accent}` }}/>{phase === "idle" ? "Ready" : phase === "building" ? "Pipeline running" : phase === "complete" ? "Build complete" : "Needs attention"}
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap:14, marginBottom:24 }}>
                    {AI_PROVIDER_CARDS.map(({ id, Icon, title, subtitle, description, color, action, enabled }) => {
                      const selected = aiProvider === id;
                      const handleSelect = () => {
                        if (!enabled) { setErrorMsg(`${title} provider is not enabled yet. Cloud AI and Local AI remain available.`); return; }
                        setErrorMsg("");
                        setAiProvider(id);
                        setLocalAiTestState("idle");
                        setLocalAiTestMessage("");
                        if (id !== "cloud") { setActivity("settings"); setSettingsSection("providers"); setSideOpen(false); }
                      };
                      return (
                        <div key={id} style={{ position:"relative", minHeight:245, display:"flex", flexDirection:"column", padding:18, border:`1px solid ${selected ? palette.accent : palette.border}`, borderRadius:12, background:selected ? "linear-gradient(180deg, rgba(0,120,212,0.10), rgba(255,255,255,0.025))" : "rgba(255,255,255,0.025)", boxShadow:selected ? `0 0 0 1px ${palette.accent}44, 0 16px 40px rgba(0,0,0,0.18)` : "none" }}>
                          {selected && <span style={{ position:"absolute", top:14, right:14, padding:"5px 8px", borderRadius:999, background:"rgba(0,120,212,0.22)", color:palette.accent, fontSize:9, fontWeight:800, letterSpacing:"0.08em" }}>SELECTED</span>}
                          <div style={{ width:64, height:64, margin:"4px auto 15px", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:16, background:`${color}22`, color, boxShadow:`inset 0 0 0 1px ${color}55` }}><Icon size={32} strokeWidth={1.8}/></div>
                          <div style={{ textAlign:"center", color:palette.textActive, fontSize:18, fontWeight:700, letterSpacing:"-0.02em" }}>{title}</div>
                          <div style={{ textAlign:"center", color, fontSize:12, fontWeight:600, marginTop:6 }}>{subtitle}</div>
                          <div style={{ flex:1, textAlign:"center", color:palette.textMuted, fontSize:12, lineHeight:1.5, margin:"10px 8px 15px" }}>{description}</div>
                          <button onClick={handleSelect} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 12px", border:`1px solid ${selected ? palette.accent : palette.borderLight}`, borderRadius:8, background:selected ? "rgba(0,120,212,0.14)" : "transparent", color:selected ? palette.accent : enabled ? color : palette.textMuted, cursor:enabled ? "pointer" : "not-allowed", fontFamily:FONT_UI, fontSize:12, fontWeight:700 }}>
                            {selected ? <Check size={15}/> : <span>{action}</span>}{!selected && enabled && <ChevronRight size={15}/>} {selected && <span>Selected</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {errorMsg && <div style={{ marginTop:14, padding:"10px 12px", border:`1px solid ${palette.error}55`, borderRadius:8, color:palette.error, background:`${palette.error}12`, fontSize:11 }}>{errorMsg}</div>}
                </div>
              </div>
            ) : (
              <React.Fragment>

            {/* Tab bar */}
            <div style={{
              height:35, flexShrink:0, background:palette.tabBar,
              borderBottom:`1px solid ${palette.border}`,
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
                      background: isActive ? palette.activeTab : palette.inactiveTab,
                      borderRight:`1px solid ${palette.border}`,
                      borderTop:`1px solid ${isActive ? palette.accent : "transparent"}`,
                      cursor:"pointer", userSelect:"none", position:"relative",
                    }}
                  >
                    <FileIcon path={tab.path} size={13}/>
                    <span style={{
                      fontSize:12, color: isActive ? palette.textActive : palette.textMuted,
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
                        border:"none", color:palette.textMuted, cursor:"pointer", flexShrink:0,
                        padding:0,
                      }}
                    ><X size={11}/></button>
                  </div>
                );
              })}
              {/* Add-tab spacer */}
              <div style={{ flex:1, background:palette.tabBar, borderBottom:`1px solid transparent` }}/>

              {/* Preview toggle button */}
              {activeFile && (
                <button
                  onClick={() => setPreviewOpen(p => !p)}
                  title={previewOpen ? "Close preview" : "Open live preview"}
                  style={{
                    display:"flex", alignItems:"center", gap:5,
                    padding:"0 12px", height:"100%", flexShrink:0,
                    background: previewOpen ? "rgba(0,122,204,0.15)" : "transparent",
                    border:"none", borderLeft:`1px solid ${palette.border}`,
                    color: previewOpen ? palette.accent : palette.textMuted,
                    fontSize:11, fontWeight:600, cursor:"pointer",
                    transition:"color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => { if (!previewOpen) e.currentTarget.style.color=palette.text; }}
                  onMouseLeave={e => { if (!previewOpen) e.currentTarget.style.color=palette.textMuted; }}
                >
                  {previewOpen ? <EyeOff size={13}/> : <Eye size={13}/>}
                  {!isMobile && (previewOpen ? " Close Preview" : " Preview")}
                </button>
              )}
            </div>

            {/* Breadcrumb bar */}
            {activeFile && (
              <div style={{
                height:24, flexShrink:0, background:palette.editorBg,
                borderBottom:`1px solid ${palette.border}`,
                display:"flex", alignItems:"center", padding:"0 12px",
                overflowX:"auto",
              }}>
                {breadcrumbs.map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight size={11} color={palette.textFaint} style={{ margin:"0 3px", flexShrink:0 }}/>}
                    <span style={{ fontSize:12, color: i===breadcrumbs.length-1 ? palette.text : palette.textMuted, whiteSpace:"nowrap", flexShrink:0 }}>
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
                  theme={isLightMode ? "vs" : "firebox-dark"}
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
                  background:palette.editorBg, fontFamily:FONT_UI,
                }}>
                  <div style={{ width:"100%", maxWidth:"none", margin:0, padding: isMobile ? "24px 12px 48px" : "28px 16px 60px", boxSizing:"border-box" }}>

                    {/* Header */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:36 }}>
                      <div>
                        <div style={{ fontSize:22, fontWeight:700, color:palette.textActive, marginBottom:4 }}>
                          My Projects
                        </div>
                        <div style={{ fontSize:13, color:palette.textMuted }}>
                          Open a project, import from GitHub, or describe a new app below.
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:10, flexShrink:0 }}>
                        <button
                          onClick={() => { setActivity("git"); setSideOpen(true); }}
                          style={{
                            display:"flex", alignItems:"center", gap:7,
                            padding:"8px 16px", borderRadius:8, border:`1px solid ${palette.border}`,
                            background:palette.sideBar, color:palette.text, fontSize:13,
                            fontFamily:FONT_UI, cursor:"pointer", fontWeight:500,
                            transition:"all 0.15s",
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.borderColor=palette.accent; e.currentTarget.style.background="#2a2d2e"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.borderColor=palette.border; e.currentTarget.style.background="#252526"; }}
                        >
                          <Github size={15}/> Import from GitHub
                        </button>
                        <button
                          onClick={() => { setActivity("workspace"); setSideOpen(false); setTimeout(()=>chatInputRef.current?.focus(),100); }}
                          style={{
                            display:"flex", alignItems:"center", gap:7,
                            padding:"8px 16px", borderRadius:8, border:"none",
                            background: palette.accent, color:"#fff", fontSize:13,
                            fontFamily:FONT_UI, cursor:"pointer", fontWeight:600,
                            boxShadow:"0 2px 8px rgba(0,120,212,0.35)",
                            transition:"all 0.15s",
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.background=palette.accentHover; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background=palette.accent; }}
                        >
                          <Sparkles size={15}/> New with AI
                        </button>
                      </div>
                    </div>

                    {/* Project grid */}
                    {recentBuilds.length > 0 ? (
                      <>
                        <div style={{ fontSize:11, fontWeight:700, color:palette.textMuted, letterSpacing:"0.1em", marginBottom:14 }}>
                          RECENT PROJECTS
                        </div>
                          <div style={{
                            display:"grid",
                            gridTemplateColumns:isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))",
                            gap:isMobile ? 10 : 12,
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
                                  background:palette.sideBar,
                                  border:`1px solid ${palette.border}`,
                                  borderRadius:12,
                                  padding:"16px 16px 14px",
                                  cursor: isLoading ? "wait" : "pointer",
                                  transition:"border-color 0.15s, transform 0.12s, box-shadow 0.15s",
                                  userSelect:"none",
                                  position:"relative",
                                  overflow:"hidden",
                                }}
                                onMouseEnter={e=>{
                                  e.currentTarget.style.borderColor=palette.accent;
                                  e.currentTarget.style.transform="translateY(-2px)";
                                  e.currentTarget.style.boxShadow=`0 6px 20px rgba(0,0,0,0.35)`;
                                  const btn = e.currentTarget.querySelector(".grid-del-btn");
                                  if (btn) btn.style.opacity="1";
                                }}
                                onMouseLeave={e=>{
                                  e.currentTarget.style.borderColor=palette.border;
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
                                    color:palette.error, cursor:"pointer",
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
                                    ? <Loader2 size={16} color={palette.accent} style={{ animation:"spin 1s linear infinite" }}/>
                                    : <Zap size={16} color={palette.accent}/>
                                  }
                                </div>

                                {/* Name */}
                                <div style={{
                                  fontSize:13, fontWeight:600, color:palette.textActive,
                                  lineHeight:1.4, marginBottom:6,
                                  display:"-webkit-box", WebkitLineClamp:2,
                                  WebkitBoxOrient:"vertical", overflow:"hidden",
                                }}>
                                  {isLoading ? "Opening project…" : (build.projectName || build.description)}
                                </div>

                                {/* Meta row */}
                                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:"auto" }}>
                                  <span style={{
                                    fontSize:11, fontWeight:500,
                                    color: isOk ? palette.success : isFail ? palette.error : palette.textMuted,
                                    display:"flex", alignItems:"center", gap:3,
                                  }}>
                                    {isOk && <CheckCircle2 size={10}/>}
                                    {isFail && <AlertTriangle size={10}/>}
                                    {isLoading ? "opening" : isOk ? "complete" : build.status}
                                  </span>
                                  {fileCount > 0 && (
                                    <span style={{ fontSize:11, color:palette.textFaint }}>· {fileCount} files</span>
                                  )}
                                  <span style={{ fontSize:11, color:palette.textFaint, marginLeft:"auto" }}>{dateStr}</span>
                                </div>

                                {/* Agent color bar */}
                                <div style={{
                                  position:"absolute", bottom:0, left:0, right:0, height:3,
                                  background:`linear-gradient(90deg,${palette.accent},#A78BFA,#F472B6)`,
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
                            onMouseEnter={e=>{ e.currentTarget.style.borderColor=palette.accent; e.currentTarget.style.background="rgba(0,120,212,0.04)"; }}
                            onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"; e.currentTarget.style.background="transparent"; }}
                          >
                            <div style={{
                              width:32, height:32, borderRadius:8,
                              background:"rgba(255,255,255,0.05)",
                              border:`1px solid rgba(255,255,255,0.1)`,
                              display:"flex", alignItems:"center", justifyContent:"center",
                            }}>
                              <Plus size={16} color={palette.textMuted}/>
                            </div>
                            <span style={{ fontSize:12, color:palette.textMuted, fontWeight:500 }}>New project</span>
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
                          <Zap size={26} color={palette.accent}/>
                        </div>
                        <div style={{ fontSize:16, fontWeight:600, color:palette.textActive, marginBottom:8 }}>
                          No projects yet
                        </div>
                        <div style={{ fontSize:13, color:palette.textMuted, marginBottom:24, lineHeight:1.6 }}>
                          Describe your app in the chat below and 7 AI agents will<br/>generate every file — live.
                        </div>
                        <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
                          <button
                            onClick={() => { setActivity("workspace"); setSideOpen(false); setTimeout(()=>chatInputRef.current?.focus(),100); }}
                            style={{
                              padding:"9px 20px", borderRadius:8, border:"none",
                              background:palette.accent, color:"#fff", fontSize:13,
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
                              border:`1px solid ${palette.border}`,
                              background:palette.sideBar, color:palette.text, fontSize:13,
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
                        background:palette.sideBar,
                        border:`1px solid ${palette.border}`,
                        borderRadius:12, padding:"18px 20px",
                        display:"flex", alignItems:"center", justifyContent:"space-between", gap:16,
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                          <div style={{
                            width:40, height:40, borderRadius:10, flexShrink:0,
                            background:"rgba(255,255,255,0.05)",
                            border:`1px solid ${palette.border}`,
                            display:"flex", alignItems:"center", justifyContent:"center",
                          }}>
                            <Github size={20} color={palette.text}/>
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:palette.textActive, marginBottom:2 }}>
                              Import from GitHub
                            </div>
                            <div style={{ fontSize:12, color:palette.textMuted }}>
                              Connect a repo — AI agents can read, edit, and push changes back.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => { setActivity("git"); setSideOpen(true); }}
                          style={{
                            flexShrink:0, padding:"7px 16px", borderRadius:8,
                            border:`1px solid ${palette.border}`,
                            background:"#2d2d2d", color:palette.text,
                            fontSize:12, fontFamily:FONT_UI,
                            cursor:"pointer", fontWeight:500, whiteSpace:"nowrap",
                          }}
                          onMouseEnter={e=>{ e.currentTarget.style.borderColor=palette.accent; }}
                          onMouseLeave={e=>{ e.currentTarget.style.borderColor=palette.border; }}
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
                  borderLeft:`1px solid ${palette.border}`, overflow:"hidden",
                  background:"#fff",
                }}>
                  {/* Preview header */}
                  <div style={{
                    height:35, flexShrink:0, display:"flex", alignItems:"center",
                    justifyContent:"space-between", padding:"0 12px",
                    background:palette.titleBar, borderBottom:`1px solid ${palette.border}`,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Globe size={12} color={palette.accent}/>
                      <span style={{ fontSize:11, fontWeight:600, color:palette.text }}>
                        {activeFile.path.split("/").pop()} — Preview
                      </span>
                    </div>
                    <button
                      onClick={() => setPreviewOpen(false)}
                      style={{ background:"none", border:"none", cursor:"pointer", color:palette.textMuted, padding:2 }}
                      title="Close preview"
                    >
                      <X size={12}/>
                    </button>
                  </div>

                  {previewUrl || previewContent ? (
                    <iframe
                      key={previewUrl || activeFile.path}
                      src={previewUrl || undefined}
                      srcDoc={previewUrl ? undefined : previewContent}
                      title="Live preview"
                      sandbox="allow-scripts allow-modals allow-forms allow-popups"
                      style={{ flex:1, border:"none", width:"100%", background:"#fff" }}
                    />
                  ) : (
                    <div style={{
                      flex:1, display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center", gap:10,
                      background:palette.editorBg, color:palette.textMuted,
                    }}>
                      <Eye size={28} color={palette.textFaint}/>
                      <div style={{ fontSize:12, color:palette.textMuted, textAlign:"center", padding:"0 20px", lineHeight:1.6 }}>
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
                  {sideOpen && activity !== "home" && activity !== "agents" && activity !== "settings" && (
                    <div style={{
                      position:"absolute", top:0, left:sideOpen ? 218 : 48, right:0,
                      bottom:0, zIndex:100,
                      background:palette.sideBar,
                      borderLeft:`1px solid ${palette.border}`,
                      display:"flex", flexDirection:"column", overflow:"hidden",
                    }}>
                      {sideContent}
                    </div>
                  )}
                  <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", paddingLeft:sideOpen ? 218 : 48 }}>
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
                {sideOpen && activity !== "home" && activity !== "agents" && activity !== "explorer" && activity !== "settings" && (
                  <>
                    <Panel
                      defaultSize="20%"
                      minSize="15%"
                      maxSize="50%"
                      style={{
                        background: palette.sideBar,
                        borderRight: `1px solid ${palette.border}`,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      {sideContent}
                    </Panel>
                    <PanelResizeHandle
                      style={{ width: 4, background: palette.border, cursor: "col-resize", flexShrink: 0, transition: "background 0.15s" }}
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
                {explorerOpen && (
                  <>
                    <PanelResizeHandle
                      style={{ width: 4, background: palette.border, cursor: "col-resize", flexShrink: 0, transition: "background 0.15s" }}
                    />
                    <Panel
                      defaultSize="22%"
                      minSize="16%"
                      maxSize="38%"
                      style={{
                        background: palette.sideBar,
                        borderLeft: `1px solid ${palette.border}`,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      {sideContent}
                    </Panel>
                  </>
                )}
              </PanelGroup>
            );
          })()}
        </div>

        {zipImportOpen && (
          <div style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(0,0,0,0.58)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={() => !importing && setZipImportOpen(false)}>
            <div style={{ width:"min(520px, 100%)", background:palette.sideBar, border:`1px solid ${palette.border}`, borderRadius:12, boxShadow:"0 20px 70px rgba(0,0,0,0.45)", overflow:"hidden" }} onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"16px 18px", borderBottom:`1px solid ${palette.border}` }}>
                <div style={{ width:34, height:34, borderRadius:9, background:"rgba(0,122,204,0.14)", display:"flex", alignItems:"center", justifyContent:"center" }}><Upload size={17} color={palette.accent}/></div>
                <div style={{ flex:1 }}><div style={{ color:palette.textActive, fontSize:14, fontWeight:700 }}>Upload your project</div><div style={{ color:palette.textMuted, fontSize:11, marginTop:2 }}>Import a ZIP and open it as a normal Firebox workspace.</div></div>
                <button onClick={() => setZipImportOpen(false)} disabled={importing} style={{ background:"transparent", border:"none", color:palette.textMuted, cursor:importing ? "not-allowed" : "pointer" }}><X size={16}/></button>
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setZipDragActive(true); }}
                onDragLeave={() => setZipDragActive(false)}
                onDrop={e => { e.preventDefault(); setZipDragActive(false); processZipFile(e.dataTransfer.files?.[0]); }}
                onClick={() => !importing && zipInputRef.current?.click()}
                style={{ margin:18, minHeight:220, border:`1px dashed ${zipDragActive ? palette.accent : palette.borderLight}`, borderRadius:10, background:zipDragActive ? "rgba(0,122,204,0.12)" : "rgba(255,255,255,0.02)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", cursor:importing ? "default" : "pointer", transition:"all 0.16s" }}
              >
                {importing ? <><Flame size={34} color={palette.accent} style={{ animation:"pulse 1.2s ease-in-out infinite" }}/><div style={{ marginTop:12, color:palette.text, fontSize:13, fontWeight:600 }}>Importing project…</div><div style={{ marginTop:4, color:palette.textMuted, fontSize:11 }}>Saving files and preparing Workspace</div></> : <><Upload size={30} color={palette.accent}/><div style={{ marginTop:12, color:palette.text, fontSize:14, fontWeight:600 }}>{zipDragActive ? "Drop ZIP to import" : "Drop your ZIP here"}</div><div style={{ marginTop:5, color:palette.textMuted, fontSize:11 }}>or click to browse · .zip supported</div></>}
                <input ref={zipInputRef} type="file" accept=".zip,application/zip" style={{ display:"none" }} onChange={e => processZipFile(e.target.files?.[0])}/>
              </div>
              <div style={{ padding:"0 18px 16px", color:palette.textFaint, fontSize:10, lineHeight:1.5 }}>Generated dependencies and the .git folder are skipped; project dotfiles such as .env and .github are preserved. After import, the Agent can inspect, edit, run, preview, and continue working on this project.</div>
            </div>
          </div>
        )}
        {/* ══ Status bar ══════════════════════════════════════════════════ */}
        <div style={{
          height: isMobile ? 20 : 22, flexShrink:0,
          background: phase==="error" ? "#5A1D1D" : palette.statusBar,
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
