import React, { useEffect, useMemo, useState } from "react";
import {
  Bot, CheckCircle2, ChevronDown, ChevronRight, Clock3, FileCode2,
  FilePlus2, FileX2, GitBranch, Loader2, Play, Terminal, TestTube2,
  TriangleAlert, Wrench, XCircle, Zap,
} from "lucide-react";
import "./agent-activity.css";

const normalizeStatus = (status) => status === "working" ? "running" : status === "done" ? "completed" : status === "error" ? "error" : status || "pending";
const normalizeType = (activity) => activity.eventType || (activity.kind === "files" ? "file.modified" : activity.kind === "tool" ? "command.started" : activity.kind === "preview" ? "preview.starting" : activity.kind === "build" ? "agent.completed" : "agent.started");
const normalizeActivity = (activity) => ({ id:activity.id || `${Date.now()}-${Math.random()}`, type:normalizeType(activity), title:activity.title || activity.label || "", description:activity.description || activity.text || "", file:activity.file || activity.path || "", command:activity.command || "", status:normalizeStatus(activity.status), timestamp:activity.timestamp || new Date(activity.time || Date.now()).getTime(), details:activity.details || "", aiGenerated:Boolean(activity.aiGenerated) });

function iconFor(type, status) {
  if (status === "error") return <XCircle size={15}/>;
  if (status === "running") return <Loader2 size={15} className="activity-spin"/>;
  if (type === "agent.started" || type === "task.started") return <Bot size={15}/>;
  if (type === "file.created") return <FilePlus2 size={15}/>;
  if (type === "file.deleted") return <FileX2 size={15}/>;
  if (type.startsWith("file.")) return <FileCode2 size={15}/>;
  if (type.startsWith("command.")) return <Terminal size={15}/>;
  if (type === "dependency.installing") return <Wrench size={15}/>;
  if (type.startsWith("test.")) return <TestTube2 size={15}/>;
  if (type.startsWith("preview.")) return <Play size={15}/>;
  if (type === "checkpoint.created") return <GitBranch size={15}/>;
  if (type === "agent.completed") return <CheckCircle2 size={15}/>;
  return <Zap size={15}/>;
}

function formatDuration(seconds) { return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function formatTime(timestamp) { return new Date(timestamp).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }

function AgentNarrationLine({ text, active = true }) {
  const [visibleText, setVisibleText] = useState("");
  useEffect(() => {
    setVisibleText("");
    if (!text) return undefined;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [text]);
  return <div className="agent-narration-line" aria-live="polite">{visibleText}{active && <span className="agent-narration-caret" aria-hidden="true" />}</div>;
}

export default function AgentActivityPanel({ taskName = "Working on your project", activities = [], startedAt, checkpointAt, preparationText = "", preparationError = "", errorText = "", userPrompt = "" }) {
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState(null);
  const [recordsExpanded, setRecordsExpanded] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const normalized = useMemo(() => activities.map(normalizeActivity), [activities]);
  const agentCompleted = normalized.some(item => item.type === "agent.completed" && item.status === "completed");
  const displayActivities = useMemo(() => normalized.map(item => agentCompleted && item.status === "running" ? { ...item, status:"completed" } : item), [normalized, agentCompleted]);
  const aiActivities = displayActivities.filter(item => item.type === "agent.output" || item.type === "agent.message" || item.type === "agent.completed");
  const recordActivities = displayActivities.filter(item => !["agent.output", "agent.message", "agent.completed", "agent.started", "task.started", "agent.failed"].includes(item.type));
  const runningActivity = [...aiActivities].reverse().find(item => item.status === "running");
  const latestAgentMessage = [...aiActivities].reverse().find(item => item.type === "agent.message");
  const actionGroups = useMemo(() => normalized.reduce((groups, item) => { const key = item.type.startsWith("file.") ? "files" : item.type.startsWith("command.") || item.type === "dependency.installing" ? "tools" : item.type.startsWith("test.") ? "tests" : item.type.startsWith("preview.") ? "preview" : item.type.startsWith("agent.") ? "agent" : "activity"; groups[key] = (groups[key] || 0) + 1; return groups; }, {}), [normalized]);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const completed = normalized.filter(item => item.status === "completed").length;
  return <aside className="agent-activity-panel">
    {userPrompt && <div className="user-prompt-line"><div className="user-prompt-label">You</div><div className="user-prompt-text">{userPrompt}</div></div>}
    {preparationText && <div className={`preparation-line${preparationError ? " preparation-error" : ""}`} aria-live="polite">{preparationText}</div>}
    {errorText && <div className="workspace-error-line" role="alert">{errorText}</div>}
    {!preparationText && latestAgentMessage && <AgentNarrationLine text={latestAgentMessage.description || latestAgentMessage.title} active={!agentCompleted} />}
    {!latestAgentMessage && runningActivity && <div className="current-operation"><div className="current-dot"><Loader2 size={14} className="activity-spin"/></div><div><div className="current-title">{runningActivity.title}</div><div className="current-description">{runningActivity.description || runningActivity.file || runningActivity.command}</div></div></div>}
    <div className="activity-list">
      {recordActivities.length > 0 && <>
        <button type="button" className="activity-record-summary" onClick={() => setRecordsExpanded(value => !value)}><span>{recordsExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} {recordActivities.length} controlled actions</span><span>{recordsExpanded ? "Hide" : "Show"}</span></button>
        {recordsExpanded && recordActivities.slice(-20).map(activity => { const expandable = Boolean(activity.details || activity.file || activity.command); const expanded = expandedId === activity.id; return <div key={activity.id} className={`activity-narrative activity-${activity.status}`}><button type="button" className="activity-narrative-main" onClick={() => expandable && setExpandedId(expanded ? null : activity.id)}><div className="activity-narrative-title">{activity.title}{expandable && (expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>)}</div><div className="activity-narrative-description">{activity.description || activity.file || activity.command}</div></button><div className="activity-narrative-meta">{formatTime(activity.timestamp)}{activity.status === "running" && <span className="running-label">running</span>}{activity.status === "completed" && <span className="completed-label"><CheckCircle2 size={12}/>done</span>}{activity.status === "error" && <span className="error-label"><TriangleAlert size={12}/>failed</span>}</div>{expanded && <div className="activity-details">{activity.details || activity.file || activity.command}</div>}</div>; })}
      </>}
      {!latestAgentMessage && !runningActivity && recordActivities.length === 0 && <div className="activity-empty" aria-label="Live AI activity field" />}
    </div>
  </aside>;
}
