import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AGENT_DEFS } from "../server/agents/config.js";
import { extractFiles } from "../server/utils/fileParser.js";
import { getCompletionStream, normalizeAiConfig } from "../server/aiProvider.js";
import { FIREBOX_TOOL_DEFINITIONS } from "../server/agents/toolContract.js";
import { runFireboxToolLoop } from "../server/agents/toolLoop.js";
import { buildPlanningPrompt, normalizePlan, AGENT_CAPABILITIES, MAX_REPAIR_ATTEMPTS } from "../server/agents/workflow.js";
import { createProjectTools } from "./tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FIREBOX_ENGINE_PORT || 8787);
const TOKEN = String(process.env.FIREBOX_ENGINE_TOKEN || "").trim();
const WORKSPACE = path.resolve(process.env.FIREBOX_WORKSPACE || path.join(__dirname, "workspace"));
const OLLAMA_ENDPOINT = String(process.env.OLLAMA_ENDPOINT || "http://127.0.0.1:11434/v1").trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "").trim();
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || "").trim();
const jobs = new Map();
const previews = new Map();
const PREVIEW_PORT = Number(process.env.FIREBOX_PREVIEW_PORT || 5173);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (TOKEN.length < 24) {
  console.error("FIREBOX_ENGINE_TOKEN must be set to a random value of at least 24 characters.");
  process.exit(1);
}

function auth(req, res, next) {
  const value = req.get("authorization") || "";
  const supplied = value.startsWith("Bearer ") ? value.slice(7) : String(req.query.token || "");
  if (!supplied || supplied.length !== TOKEN.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(TOKEN))) {
    return res.status(401).json({ error: "Unauthorized local engine request" });
  }
  next();
}

function safeWorkspacePath(relativePath, root = WORKSPACE) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === "..") {
    throw new Error(`Unsafe project path: ${relativePath}`);
  }
  const absolute = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) throw new Error("Path escapes the Firebox workspace");
  return absolute;
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function getStreamWithRepair({ config, messages, maxTokens, temperature, res, agent }) {
  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    try { return await getCompletionStream({ config, messages, maxTokens, temperature }); }
    catch (error) {
      if (attempt >= MAX_REPAIR_ATTEMPTS) throw error;
      send(res, "workflow-repair", { agent, attempt, maxAttempts: MAX_REPAIR_ATTEMPTS, message: error.message });
    }
  }
  throw new Error("Provider retry limit reached");
}

async function probePreview(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "manual" });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPreviewReady(url, child, maxWaitMs = 15000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.killed) throw new Error("Preview process exited before becoming ready");
    if (await probePreview(url)) return true;
    await sleep(250);
  }
  throw new Error(`Preview did not become healthy within ${maxWaitMs}ms`);
}

async function startPreviewProcess(projectDir, projectName, script = "dev", port = PREVIEW_PORT) {
  const existing = previews.get(projectName);
  if (existing && existing.child.exitCode === null && !existing.child.killed) {
    const url = `http://127.0.0.1:${existing.port}`;
    if (await probePreview(url)) return { projectName, port: existing.port, url, healthy: true };
    stopPreviewProcess(projectName);
  }
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, ["run", script, "--", "--host", "0.0.0.0", "--port", String(port)], { cwd: projectDir, shell: false, windowsHide: true });
  const preview = { child, port, script, startedAt: new Date().toISOString(), lastOutput: "" };
  child.stdout?.on("data", (chunk) => { preview.lastOutput = String(chunk).slice(-4000); });
  child.stderr?.on("data", (chunk) => { preview.lastOutput = String(chunk).slice(-4000); });
  child.on("error", (error) => { preview.error = error.message; });
  child.on("exit", (code, signal) => {
    preview.exitCode = code;
    preview.signal = signal;
    if (previews.get(projectName)?.child === child) previews.delete(projectName);
  });
  previews.set(projectName, preview);
  const url = `http://127.0.0.1:${port}`;
  await waitForPreviewReady(url, child);
  return { projectName, port, url, healthy: true };
}

function stopPreviewProcess(projectName) {
  const preview = previews.get(projectName);
  if (!preview) return false;
  const child = preview.child;
  if (child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null && !child.killed) child.kill("SIGKILL"); }, 2000).unref?.();
  }
  previews.delete(projectName);
  return true;
}

function runCommand(command, args, cwd, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    child.stdout.on("data", (chunk) => onOutput(String(chunk)));
    child.stderr.on("data", (chunk) => onOutput(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`)));
  });
}

async function runProjectChecks(projectDir, emit) {
  const packageFile = path.join(projectDir, "package.json");
  try { await fs.access(packageFile); } catch { return; }
  emit("tool-start", { tool: "install_dependencies" });
  await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], projectDir, (output) => emit("tool-output", { tool: "install_dependencies", output: output.slice(-4000) }));
  emit("tool-complete", { tool: "install_dependencies" });
  const packageJson = JSON.parse(await fs.readFile(packageFile, "utf8"));
  if (packageJson.scripts?.test) {
    emit("tool-start", { tool: "run_tests" });
    await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", ["test", "--", "--runInBand"], projectDir, (output) => emit("tool-output", { tool: "run_tests", output: output.slice(-4000) }));
    emit("tool-complete", { tool: "run_tests" });
  }
  if (packageJson.scripts?.build) {
    emit("tool-start", { tool: "build_project" });
    await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], projectDir, (output) => emit("tool-output", { tool: "build_project", output: output.slice(-4000) }));
    emit("tool-complete", { tool: "build_project" });
  }
}

async function waitForResume(job, res, signal) {
  if (!job.paused) return true;
  send(res, "workflow-paused", { jobId: job.id, message: "Paused at a safe workflow checkpoint" });
  while (job.paused && !signal?.aborted) await sleep(500);
  if (!signal?.aborted) send(res, "workflow-resumed", { jobId: job.id });
  return !signal?.aborted;
}

async function runAutonomousToolLoop(job, res, tools, config, signal) {
  const messages = [
    { role: "system", content: "You are the Firebox Agent. Use Firebox tools to inspect, edit, test, repair, and preview the current project. Never assume direct filesystem or shell access. Inspect before major changes, keep changes compatible with the existing architecture, and verify your work before preview." },
    { role: "user", content: job.description },
  ];
  return runFireboxToolLoop({
    config,
    messages,
    toolDefinitions: FIREBOX_TOOL_DEFINITIONS,
    signal,
    emit: (event, data) => send(res, event, data),
    executeTool: (name, args) => {
      if (!tools[name]) throw new Error(`Firebox tool is not available: ${name}`);
      if (name === "run_command") return tools[name](args.command, args.args || [], (output) => send(res, "tool-output", { tool: name, output: String(output).slice(-4000) }));
      if (["read_file", "search_project", "create_file", "write_file", "delete_file", "edit_file", "install_package"].includes(name)) return tools[name](...(name === "edit_file" ? [args.path, args.search, args.replacement] : name === "create_file" || name === "write_file" ? [args.path, args.content] : name === "install_package" ? [args.package] : name === "read_file" || name === "delete_file" ? [args.path] : [args.term]));
      return tools[name]();
    },
  });
}

async function runBuild(job, res, signal) {
  const projectDir = safeWorkspacePath(job.projectName);
  await fs.mkdir(projectDir, { recursive: true });
  const outputs = {};
  const emit = (event, data) => send(res, event, data);
  const tools = createProjectTools({
    root: projectDir,
    emit,
    startPreview: async () => {
      const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
      const script = packageJson.scripts?.dev ? "dev" : packageJson.scripts?.start ? "start" : null;
      if (!script) throw new Error("Project has no dev or start script");
      return startPreviewProcess(projectDir, job.projectName, script);
    },
    getPreviewStatus: async () => {
      const preview = previews.get(job.projectName);
      if (!preview || preview.child.exitCode !== null || preview.child.killed) return { running: false, projectName: job.projectName, error: preview?.error || null };
      const url = `http://127.0.0.1:${preview.port}`;
      const healthy = await probePreview(url);
      return { running: healthy, healthy, projectName: job.projectName, port: preview.port, url, lastOutput: preview.lastOutput || null };
    },
  });
  const config = normalizeAiConfig({ provider: "local", endpoint: job.endpoint, model: job.model, apiKey: job.apiKey });
  const inspectedProject = await tools.inspect_project();
  send(res, "project-inspected", { files: inspectedProject.files, packageJson: inspectedProject.packageJson ? { name: inspectedProject.packageJson.name, scripts: inspectedProject.packageJson.scripts || {}, dependencies: Object.keys(inspectedProject.packageJson.dependencies || {}) } : null });

  if (job.toolMode) {
    await waitForResume(job, res, signal);
    const result = await runAutonomousToolLoop(job, res, tools, config, signal);
    let preview = null;
    try {
      preview = await tools.start_preview();
      send(res, "preview-ready", preview);
    } catch (error) {
      send(res, "preview-error", { message: error.message });
    }
    send(res, "agent-complete", { agent: "Firebox Agent", capability: { id: "autonomous", label: "Firebox Agent", activity: "Completed controlled tool workflow" }, output: result.content });
    send(res, "build-complete", { projectName: job.projectName, workspace: projectDir, preview: preview?.url ? preview : null });
    return;
  }

  for (const agent of AGENT_DEFS) {
    if (signal?.aborted) throw new Error("Build stopped by user");
    if (!await waitForResume(job, res, signal)) throw new Error("Build stopped by user");
    const capability = AGENT_CAPABILITIES[agent.name] || { id: agent.name.toLowerCase(), label: agent.task, activity: agent.task };
    send(res, "workflow-stage-start", { stage: capability.id, label: capability.label, activity: capability.activity, agent: agent.name });
    send(res, "agent-start", { agent: agent.name, task: agent.task, capability });
    const context = [`## App Description\n${job.description}`];
    for (const [name, output] of Object.entries(outputs)) context.push(`\n## ${name} Agent Output\n${output}`);
    const stream = await getStreamWithRepair({
      config,
      messages: [{ role: "system", content: agent.systemPrompt }, { role: "user", content: context.join("\n\n") }],
      maxTokens: 4000,
      temperature: 0.2,
    });
    let full = "";
    let buffer = "";
    for await (const token of stream) {
      const text = typeof token === "string" ? token : token.choices?.[0]?.delta?.content || "";
      if (!text) continue;
      full += text;
      buffer += text;
      if (buffer.length >= 30) {
        send(res, "agent-token", { agent: agent.name, token: buffer });
        buffer = "";
      }
    }
    if (buffer) send(res, "agent-token", { agent: agent.name, token: buffer });
    if (!await waitForResume(job, res, signal)) throw new Error("Build stopped by user");
    outputs[agent.name] = full;
    const files = extractFiles(agent.name, full);
    for (const file of files) {
      await tools.write_file(file.path, file.content);
      send(res, "file-written", { agent: agent.name, path: file.path, language: file.language });
    }
    send(res, "agent-complete", { agent: agent.name, output: full, files, capability });
    send(res, "workflow-stage-complete", { stage: capability.id, label: capability.label, agent: agent.name });
  }

  try {
    await runProjectChecks(projectDir, (event, data) => send(res, event, data));
  } catch (error) {
    send(res, "tool-error", { message: error.message });
  }
  let preview = null;
  try {
    preview = await tools.start_preview();
    send(res, "preview-ready", preview);
  } catch (error) {
    send(res, "preview-error", { message: error.message });
  }
  send(res, "build-complete", { projectName: job.projectName, workspace: projectDir, preview: preview?.url ? preview : null });
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.get("origin") || "null");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", auth, async (req, res) => {
  res.json({ ok: true, engine: "firebox-local", workspace: WORKSPACE, ollamaEndpoint: OLLAMA_ENDPOINT, model: OLLAMA_MODEL || null });
});

app.post("/api/chat", auth, async (req, res) => {
  try {
    const config = normalizeAiConfig({ provider: "local", endpoint: req.body?.endpoint || OLLAMA_ENDPOINT, model: req.body?.model || OLLAMA_MODEL, apiKey: req.body?.apiKey || OLLAMA_API_KEY });
    const stream = await getCompletionStream({ config, messages: Array.isArray(req.body?.messages) ? req.body.messages : [], maxTokens: 256, temperature: 0.5 });
    let text = "";
    for await (const token of stream) {
      text += typeof token === "string" ? token : token.choices?.[0]?.delta?.content || "";
    }
    res.json({ ok: true, text });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/plan", auth, async (req, res) => {
  try {
    const config = normalizeAiConfig({ provider: "local", endpoint: req.body?.endpoint || OLLAMA_ENDPOINT, model: req.body?.model || OLLAMA_MODEL, apiKey: req.body?.apiKey || OLLAMA_API_KEY });
    const stream = await getCompletionStream({ config, messages: [{ role: "user", content: buildPlanningPrompt({ description: String(req.body?.description || "").trim(), fileNames: Array.isArray(req.body?.fileNames) ? req.body.fileNames : [] }) }], maxTokens: 900, temperature: 0.2 });
    let raw = "";
    for await (const token of stream) raw += typeof token === "string" ? token : token.choices?.[0]?.delta?.content || "";
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
    let plan;
    try { plan = normalizePlan(JSON.parse(jsonText || raw)); } catch { plan = normalizePlan({ summary: raw.replace(/```json|```/g, "").trim() }); }
    res.json({ ok: true, plan });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/test-ollama", auth, async (req, res) => {
  try {
    const config = normalizeAiConfig({ provider: "local", endpoint: req.body?.endpoint || OLLAMA_ENDPOINT, model: req.body?.model || OLLAMA_MODEL, apiKey: req.body?.apiKey || OLLAMA_API_KEY });
    const response = await fetch(`${config.endpoint.replace(/\/+$/, "")}/models`, { headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const models = Array.isArray(data.data) ? data.data.map((model) => model.id).filter(Boolean) : [];
    res.json({ ok: true, models, selectedModel: config.model, selectedModelAvailable: models.includes(config.model), endpoint: config.endpoint });
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message || "unknown network cause";
    res.status(502).json({
      ok: false,
      error: `Ollama request failed at ${OLLAMA_ENDPOINT}: ${error.message}`,
      cause,
      endpoint: OLLAMA_ENDPOINT,
    });
  }
});

app.post("/api/preview/start", auth, async (req, res) => {
  try {
    const projectName = String(req.body?.projectName || "").trim();
    if (!projectName) return res.status(400).json({ error: "Project name is required" });
    const projectDir = safeWorkspacePath(projectName);
    const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
    const script = packageJson.scripts?.dev ? "dev" : packageJson.scripts?.start ? "start" : null;
    if (!script) return res.status(400).json({ error: "Project has no dev or start script" });
    const preview = await startPreviewProcess(projectDir, projectName, script, Number(req.body?.port || PREVIEW_PORT));
    res.json({ ok: true, preview });
  } catch (error) { res.status(400).json({ ok: false, error: error.message }); }
});

app.post("/api/preview/stop", auth, (req, res) => {
  const projectName = String(req.body?.projectName || "").trim();
  res.json({ ok: true, stopped: stopPreviewProcess(projectName) });
});

app.get("/api/preview/status", auth, async (req, res) => {
  const projectName = String(req.query?.projectName || "").trim();
  const preview = previews.get(projectName);
  if (!preview || preview.child.exitCode !== null || preview.child.killed) {
    return res.json({ ok: true, running: false, preview: null });
  }
  const url = `http://127.0.0.1:${preview.port}`;
  const healthy = await probePreview(url);
  res.json({ ok: true, running: healthy, preview: healthy ? { projectName, port: preview.port, url } : null, lastOutput: preview.lastOutput || null });
});

app.post("/api/build", auth, async (req, res) => {
  const { description, endpoint = OLLAMA_ENDPOINT, model = OLLAMA_MODEL, apiKey = OLLAMA_API_KEY, projectName, toolMode = false } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: "Description is required" });
  if (!model?.trim()) return res.status(400).json({ error: "Local AI model is required" });
  const safeName = String(projectName || `firebox-project-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { id: jobId, description: description.trim(), endpoint, model, apiKey, projectName: safeName, toolMode: Boolean(toolMode), paused: false });
  res.json({ jobId, projectName: safeName });
});

app.post("/api/build/:id/pause", auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Build job not found" });
  job.paused = true;
  res.json({ ok: true, executionState: "paused" });
});

app.post("/api/build/:id/resume", auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Build job not found" });
  job.paused = false;
  res.json({ ok: true, executionState: "running" });
});

app.get("/api/build/:id/events", auth, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Build job not found" });
  const controller = new AbortController();
  req.on("close", () => controller.abort());
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  try { await runBuild(job, res, controller.signal); } catch (error) { if (!controller.signal.aborted) send(res, "build-error", { message: error.message }); }
  jobs.delete(job.id);
  res.end();
});

await fs.mkdir(WORKSPACE, { recursive: true });
app.listen(PORT, "127.0.0.1", () => console.log(`Firebox Local Engine listening on http://127.0.0.1:${PORT}`));
