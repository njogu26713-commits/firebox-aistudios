import React, { useEffect, useMemo, useState } from "react";
import {
  Bot, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  FileCode2, FilePlus2, FileX2, GitBranch, Loader2, Play, Terminal,
  TestTube2, TriangleAlert, Wrench, XCircle, Zap,
} from "lucide-react";
import "./agent-activity.css";

const typeFor = (activity) => {
  if (activity.eventType) return activity.eventType;
  if (activity.kind === "files") return activity.status === "done" ? "file.modified" : "file.read";
  if (activity.kind === "tool") return "command.started";
  if (activity.kind === "preview") return "preview.starting";
  if (activity.kind === "build") return "agent.completed";
  if (activity.kind === "repair") return "agent.failed";
  return "agent.started";
};

const normalizeStatus = (status) => status === "working" ? "running" : status === "done" ? "completed" : status === "error" ? "error" : "pending";

export function normalizeAgentActivity(activity) {
  return {
    id: activity.id || `${Date.now()}-${Math.random()}`,
    type: typeFor(activity),
    title: activity.title || activity.label || "Agent activity",
    description: activity.description || activity.text || "",
    file: activity.file || activity.path || "",
    command: activity.command || "",
    status: normalizeStatus(activity.status),
    timestamp: activity.timestamp || new Date(activity.time || Date.now()).getTime(),
    details: activity.details || "",
  };
}

function getActivityIcon(type, status) {
  if (status === "error") return <XCircle size={15} />;
  if (status === "running") return <Loader2 size={15} className="activity-spin" />;
  switch (type) {
    case "agent.started": case "task.started": return <Bot size={15} />;
    case "file.read": case "file.modified": return <FileCode2 size={15} />;
    case "file.created": return <FilePlus2 size={15} />;
    case "file.deleted": return <FileX2 size={15} />;
    case "command.started": case "command.output": case "command.completed": return <Terminal size={15} />;
    case "dependency.installing": return <Wrench size={15} />;
    case "test.started": case "test.completed": return <TestTube2 size={15} />;
    case "preview.starting": case "preview.ready": case "preview.error": return <Play size={15} />;
    case "checkpoint.created": return <GitBranch size={15} />;
    case "agent.completed": return <CheckCircle2 size={15} />;
    case "agent.failed": return <TriangleAlert size={15} />;
    default: return <Zap size={15} />;
  }
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ActivityItem({ activity }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(activity.details || activity.file || activity.command);
  return (
    <div className={`activity-item activity-${activity.status}`}>
      <div className="activity-line">
        <div className="activity-icon">{getActivityIcon(activity.type, activity.status)}</div>
        <div className="activity-content">
          <button className="activity-main" onClick={() => hasDetails && setExpanded(value => !value)} type="button">
            <div className="activity-title-row"><span className="activity-title">{activity.title}</span>{hasDetails && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</div>
            {activity.description && <div className="activity-description">{activity.description}</div>}
            {activity.file && <div className="activity-file">{activity.file}</div>}
            {activity.command && <div className="activity-command"><Terminal size={12} />{activity.command}</div>}
          </button>
          <div className="activity-meta">
            <span>{formatTime(activity.timestamp)}</span>
            {activity.status === "completed" && <span className="completed-label"><Check size={12} />done</span>}
            {activity.status === "running" && <span className="running-label">running</span>}
            {activity.status === "error" && <span className="error-label">failed</span>}
          </div>
          {expanded && <div className="activity-details">{activity.details || activity.file || activity.command}</div>}
        </div>
      </div>
    </div>
  );
}

export default function AgentActivityPanel({ taskName = "Working on your project", activities = [], startedAt, checkpointAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const normalized = useMemo(() => activities.map(normalizeAgentActivity), [activities]);
  const completedCount = useMemo(() => normalized.filter(activity => activity.status === "completed").length, [normalized]);
  const runningActivity = [...normalized].reverse().find(activity => activity.status === "running");
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  return (
    <aside className="agent-activity-panel">
      <div className="active-task-card">
        <div className="active-task-left"><div className="agent-task-icon"><Bot size={18} /></div><div><div className="task-label">ACTIVE TASK</div><div className="task-name">{taskName}</div></div></div>
        <button className="task-menu" type="button" aria-label="Task menu">•••</button>
      </div>
      {runningActivity && <div className="current-operation"><div className="current-dot"><Loader2 size={14} className="activity-spin" /></div><div><div className="current-title">{runningActivity.title}</div><div className="current-description">{runningActivity.description}</div></div></div>}
      <div className="activity-list">{normalized.map(activity => <ActivityItem key={activity.id} activity={activity} />)}</div>
      <div className="activity-summary">
        <div className="summary-item"><Zap size={15} /><span>{normalized.length} actions</span></div>
        <div className="summary-item"><Clock3 size={15} /><span>Worked for {formatDuration(elapsedSeconds)}</span></div>
        {checkpointAt && <div className="summary-item checkpoint"><CheckCircle2 size={15} /><span>Checkpoint made {formatTime(new Date(checkpointAt).getTime())}</span></div>}
        <div className="completion-summary">{completedCount}/{normalized.length} completed</div>
      </div>
    </aside>
  );
}
