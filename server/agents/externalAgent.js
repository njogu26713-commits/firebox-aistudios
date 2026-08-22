import Build from "../models/Build.js";

const AGENTS = {
  "groq-agent": { id: "groq-agent", name: "Groq Agent", url: process.env.GROQ_AGENT_URL, secret: process.env.GROQ_AGENT_SECRET || process.env.GROQ_AGENT_SHARED_SECRET },
  "openrouter-agent": { id: "openrouter-agent", name: "OpenRouter Agent", url: process.env.OPENROUTER_AGENT_URL, secret: process.env.OPENROUTER_AGENT_SECRET || process.env.OPENROUTER_AGENT_SHARED_SECRET },
  "openai-agent": { id: "openai-agent", name: "OpenAI Agent", url: process.env.OPENAI_AGENT_URL, secret: process.env.OPENAI_AGENT_SECRET || process.env.OPENAI_AGENT_SHARED_SECRET },
  "gemini-agent": { id: "gemini-agent", name: "Gemini Agent", url: process.env.GEMINI_AGENT_URL, secret: process.env.GEMINI_AGENT_SECRET || process.env.GEMINI_AGENT_SHARED_SECRET },
  "claude-agent": { id: "claude-agent", name: "Claude Agent", url: process.env.CLAUDE_AGENT_URL, secret: process.env.CLAUDE_AGENT_SECRET || process.env.CLAUDE_AGENT_SHARED_SECRET },
};

function endpoint(agentId) {
  const config = AGENTS[agentId];
  if (!config?.url) throw new Error(`${config?.name || agentId} URL is not configured on the Firebox Main Server.`);
  return config;
}

function authHeaders(config) {
  if (!config.secret) throw new Error(`${config.name} credential is not configured on the Firebox Main Server.`);
  return { authorization: `Bearer ${config.secret}` };
}

function forward(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function readContractEvents(response, onEvent) {
  if (!response.body) throw new Error("Agent returned an empty event stream.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n"); buffer = frames.pop() || "";
    for (const frame of frames) {
      const line = frame.split("\n").find(item => item.startsWith("data:")); if (!line) continue;
      try { await onEvent(JSON.parse(line.slice(5).trim())); } catch (error) { if (error?.code) throw error; }
    }
  }
}

export function isExternalAgent(provider) { return ["groq-agent", "openrouter-agent", "openai-agent", "gemini-agent", "claude-agent"].includes(provider); }
export function externalAgentConfig(provider) { return AGENTS[provider] || null; }

export async function runExternalAgent(build, res, signal) {
  const agentId = String(build.provider);
  const config = endpoint(agentId);
  const headers = { ...authHeaders(config), "content-type": "application/json", "x-request-id": build._id.toString() };
  const files = Array.isArray(build.files) ? build.files.map(file => ({ path: file.path, content: file.content })) : [];
  const projectType = files.length ? "existing" : "new";
  const response = await fetch(`${config.url.replace(/\/$/, "")}/v1/agent/tasks`, { method: "POST", headers, signal, body: JSON.stringify({ taskId: build._id.toString(), requestId: build._id.toString(), agent: agentId, prompt: build.description, project: { id: build._id.toString(), buildId: build._id.toString(), workspaceId: build._id.toString(), type: projectType, framework: build.stack?.framework || null, database: build.stack?.database || null, stack: build.stack || null, files }, capabilities: { filesystem: true, terminal: true, preview: true, tests: true, "project-files": true, "file-tools": true, commands: true } }) });
  const accepted = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(accepted?.error?.message || `${config.name} returned HTTP ${response.status}`);
  forward(res, "external-agent.accepted", { agent: agentId, taskId: accepted.taskId, contractVersion: accepted.contractVersion });

  const eventUrl = new URL(accepted.eventsUrl, `${config.url.replace(/\/$/, "")}/`).toString();
  const events = await fetch(eventUrl, { headers: authHeaders(config), signal });
  if (!events.ok) throw new Error(`${config.name} event stream returned HTTP ${events.status}`);
  let output = "";
  await readContractEvents(events, async event => {
    if (event.type === "agent.output") output += String(event.token || "");
    if ((event.type === "file.created" || event.type === "file.modified") && event.path && typeof event.content === "string") {
      await Build.findByIdAndUpdate(build._id, { $pull: { files: { path: event.path } } });
      await Build.findByIdAndUpdate(build._id, { $push: { files: { path: event.path, content: event.content, agent: config.name } } });
    }
    forward(res, event.type, { ...event, agent: config.name, externalAgent: agentId });
    if (event.type === "agent.failed") throw new Error(event.error?.message || `${config.name} failed`);
    if (event.type === "agent.cancelled") throw new Error(`${config.name} task was cancelled`);
  });
  await Build.findByIdAndUpdate(build._id, { $set: { status: "complete", errorMessage: "" } });
  forward(res, "agent.message", { agent: config.name, description: output.trim() || `${config.name} completed the task.`, status: "completed", aiGenerated: true });
  forward(res, "agent.completed", { agent: config.name, title: `${config.name} completed`, description: "Project work finished", status: "completed", externalAgent: agentId });
  forward(res, "build-complete", { buildId: build._id.toString(), externalAgent: agentId });
}
