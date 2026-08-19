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
import { createBrowserRuntime } from "./browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FIREBOX_ENGINE_PORT || 8787);
const TOKEN = String(process.env.FIREBOX_ENGINE_TOKEN || "").trim();
const WORKSPACE = path.resolve(process.env.FIREBOX_WORKSPACE || path.join(__dirname, "workspace"));
const OLLAMA_ENDPOINT = String(process.env.OLLAMA_ENDPOINT || "http://127.0.0.1:11434/v1").trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "").trim();
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || "").trim();
const jobs = new Map();
const PREVIEW_PORT = Number(process.env.FIREBOX_PREVIEW_PORT || 5173);
const PREVIEW_IDLE_MS = Number(process.env.FIREBOX_PREVIEW_IDLE_MS || 30 * 60 * 1000);
const previews = new Map();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function detectProject(projectDir) {
  let packageJson = null;
  try { packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8")); } catch {}
  const has = async (name) => { try { await fs.access(path.join(projectDir, name)); return true; } catch { return false; } };
  const packageManager = await has("pnpm-lock.yaml") ? "pnpm" : await has("yarn.lock") ? "yarn" : await has("package-lock.json") ? "npm" : "npm";
  const deps = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
  const framework = deps.next ? "next" : deps.nuxt ? "nuxt" : deps.vue ? "vue" : deps.angular || deps["@angular/core"] ? "angular" : deps.react ? "react" : packageJson ? "node" : "static";
  const script = packageJson?.scripts?.dev ? "dev" : packageJson?.scripts?.start ? "start" : packageJson?.scripts?.preview ? "preview" : null;
  return { packageJson, packageManager, framework, script, scripts: packageJson?.scripts || {} };
}

function packageManagerCommand(packageManager) {
  if (packageManager === "pnpm") return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (packageManager === "yarn") return process.platform === "win32" ? "yarn.cmd" : "yarn";
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function allocatePreviewPort(projectName, requestedPort = PREVIEW_PORT) {
  const used = new Set([...previews.values()].filter((item) => item.projectName !== projectName).map((item) => item.port));
  let port = Number(requestedPort) || PREVIEW_PORT;
  while (used.has(port)) port += 1;
  return port;
}

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

async function startPreviewProcess(projectDir, projectName, script = null, port = PREVIEW_PORT) {
  const detected = await detectProject(projectDir);
  const selectedScript = script || detected.script;
  if (!selectedScript) throw new Error("Project has no supported dev, start, or preview script");
  const packageManager = detected.packageManager;
  const framework = detected.framework;
  const allocatedPort = allocatePreviewPort(projectName, port);
  const existing = previews.get(projectName);
  if (existing && existing.child.exitCode === null && !existing.child.killed) {
    const url = `http://127.0.0.1:${existing.port}`;
    existing.lastAccessAt = Date.now();
    if (await probePreview(url)) return { projectName, port: existing.port, url, gatewayUrl:previewGatewayUrl(projectName), healthy: true, status:"running", framework:existing.framework, packageManager:existing.packageManager, script:existing.script, startedAt:existing.startedAt };
    stopPreviewProcess(projectName);
  }
  const command = packageManagerCommand(packageManager);
  const args = ["run", selectedScript];
  if (framework === "next") args.push("--", "-H", "0.0.0.0", "-p", String(allocatedPort));
  else args.push("--", "--host", "0.0.0.0", "--port", String(allocatedPort));
  const child = spawn(command, args, { cwd: projectDir, shell: false, windowsHide: true });
  const preview = { child, projectName, port:allocatedPort, script:selectedScript, framework, packageManager, startedAt: new Date().toISOString(), lastAccessAt:Date.now(), status:"starting", healthy:false, lastOutput: "" };
  child.stdout?.on("data", (chunk) => { preview.lastOutput = String(chunk).slice(-4000); });
  child.stderr?.on("data", (chunk) => { preview.lastOutput = String(chunk).slice(-4000); });
  child.on("error", (error) => { preview.error = error.message; });
  child.on("exit", (code, signal) => {
    preview.exitCode = code;
    preview.signal = signal;
    if (previews.get(projectName)?.child === child) previews.delete(projectName);
  });
  previews.set(projectName, preview);
  const url = `http://127.0.0.1:${allocatedPort}`;
  preview.status = "checking";
  await waitForPreviewReady(url, child);
  preview.status = "running";
  preview.healthy = true;
  return { projectName, port:allocatedPort, url, gatewayUrl:previewGatewayUrl(projectName), healthy: true, status:"running", framework, packageManager, script:selectedScript, startedAt:preview.startedAt };
}

function previewGatewayUrl(projectName, runtimePath = "") {
  const suffix = runtimePath ? `/${String(runtimePath).replace(/^\/+/, "")}` : "/";
  return `http://127.0.0.1:${PORT}/preview/${encodeURIComponent(projectName)}${suffix}?token=${encodeURIComponent(TOKEN)}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [projectName, preview] of previews.entries()) {
    if (preview.lastAccessAt && now - preview.lastAccessAt > PREVIEW_IDLE_MS) stopPreviewProcess(projectName);
  }
}, 60_000).unref?.();

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

async function ensureDependencies(projectDir, emit = () => {}) {
  const detected = await detectProject(projectDir);
  if (!detected.packageJson) return detected;
  const nodeModulesDir = path.join(projectDir, "node_modules");
  let installed = true;
  try { await fs.access(nodeModulesDir); } catch { installed = false; }
  if (!installed) {
    const manager = packageManagerCommand(detected.packageManager);
    const args = detected.packageManager === "npm" ? ["install", "--no-audit", "--no-fund"] : ["install"];
    emit("runtime-state", { status:"installing", projectName:path.basename(projectDir), packageManager:detected.packageManager });
    await runCommand(manager, args, projectDir, (output) => emit("runtime-output", { output:String(output).slice(-4000) }));
    emit("runtime-state", { status:"installed", projectName:path.basename(projectDir), packageManager:detected.packageManager });
  }
  return detected;
}

async function runProjectChecks(projectDir, emit) {
  const packageFile = path.join(projectDir, "package.json");
  try { await fs.access(packageFile); } catch { return; }
  const detected = await detectProject(projectDir);
  const manager = packageManagerCommand(detected.packageManager);
  emit("workflow-stage-start", { stage:"dependencies", label:"Dependencies", activity:`Installing dependencies with ${detected.packageManager}` });
  emit("tool-start", { tool: "install_dependencies", packageManager:detected.packageManager });
  const installArgs = detected.packageManager === "npm" ? ["install", "--no-audit", "--no-fund"] : ["install"];
  await runCommand(manager, installArgs, projectDir, (output) => emit("tool-output", { tool: "install_dependencies", output: output.slice(-4000) }));
  emit("tool-complete", { tool: "install_dependencies", packageManager:detected.packageManager });
  emit("workflow-stage-complete", { stage:"dependencies", label:"Dependencies" });
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
    { role: "system", content: "You are the Firebox Agent. Use Firebox tools to inspect, edit, test, repair, preview, and verify the current project. Never assume direct filesystem or shell access. Inspect before major changes, keep changes compatible with the existing architecture, and create a concrete task plan before editing. After code changes, run the project checks, start the preview, open it with browser_open, inspect the rendered page, and use browser_click, browser_fill, and browser_assert to test the real user workflow implied by the request. Read browser_console for console or page errors. If a browser interaction or assertion fails, inspect the failure, repair the relevant code with Firebox tools, and repeat the browser check before completing. Do not claim success from compilation alone." },
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
      if (name === "browser_open") return tools[name](args.url);
      if (name === "browser_click") return tools[name](args.selector);
      if (name === "browser_fill") return tools[name](args.selector, args.text);
      if (name === "browser_assert") return tools[name](args.selector, args.expectedText || "");
      return tools[name]();
    },
  });
}

async function runBuild(job, res, signal) {
  const projectDir = safeWorkspacePath(job.projectName);
  await fs.mkdir(projectDir, { recursive: true });
  const outputs = {};
  const emit = (event, data) => send(res, event, data);
  const getJobPreviewStatus = async () => {
    const preview = previews.get(job.projectName);
    if (!preview || preview.child.exitCode !== null || preview.child.killed) return { running: false, projectName: job.projectName, error: preview?.error || null };
    const url = `http://127.0.0.1:${preview.port}`;
    const healthy = await probePreview(url);
    return { running: healthy, healthy, projectName: job.projectName, port: preview.port, url, lastOutput: preview.lastOutput || null };
  };
  const browser = createBrowserRuntime({ getPreviewStatus: getJobPreviewStatus, emit });
  const tools = createProjectTools({
    root: projectDir,
    emit,
    browser,
    startPreview: async () => {
      const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
      const script = packageJson.scripts?.dev ? "dev" : packageJson.scripts?.start ? "start" : null;
      if (!script) throw new Error("Project has no dev or start script");
      return startPreviewProcess(projectDir, job.projectName, script);
    },
    getPreviewStatus: getJobPreviewStatus,
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

app.post("/api/terminal", auth, async (req, res) => {
  const projectName = String(req.body?.projectName || "").trim();
  const rawCommand = String(req.body?.command || "").trim();
  if (!projectName || !rawCommand) return res.status(400).json({ ok:false, error:"A project and command are required." });
  if (/[;&|`$<>]/.test(rawCommand)) return res.status(400).json({ ok:false, error:"Shell operators are not allowed in the Terminal command." });
  const parts = rawCommand.split(/\s+/);
  const [command, ...args] = parts;
  const output = [];
  try {
    await runCommand(command, args, safeWorkspacePath(projectName), (chunk) => output.push(String(chunk)));
    res.json({ ok:true, command:rawCommand, output:output.join("").slice(-20000) });
  } catch (error) {
    res.status(400).json({ ok:false, command:rawCommand, output:output.join("").slice(-20000), error:error.message });
  }
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

app.all("/preview/:projectName/*", auth, async (req, res) => {
  const projectName = String(req.params.projectName || "").trim();
  const runtime = previews.get(projectName);
  if (!runtime || runtime.child.exitCode !== null || runtime.child.killed) return res.status(404).send("Preview runtime is not running");
  const runtimePath = String(req.params[0] || "").replace(/^\/+/, "");
  const target = `http://127.0.0.1:${runtime.port}/${runtimePath}`;
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.authorization;
    const response = await fetch(target, { method:req.method, headers, redirect:"manual" });
    res.status(response.status);
    response.headers.forEach((value, key) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(key)) res.setHeader(key, value); });
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(502).send(`Preview gateway error: ${error.message}`);
  }
});

app.post("/api/preview/start", auth, async (req, res) => {
  try {
    const projectName = String(req.body?.projectName || "").trim();
    if (!projectName) return res.status(400).json({ error: "Project name is required" });
    const projectDir = safeWorkspacePath(projectName);
    const detected = await ensureDependencies(projectDir);
    if (!detected.script) return res.status(400).json({ error: "Project has no supported dev, start, or preview script", detected });
    const preview = await startPreviewProcess(projectDir, projectName, detected.script, Number(req.body?.port || PREVIEW_PORT));
    res.json({ ok: true, detected: { framework:detected.framework, packageManager:detected.packageManager, script:detected.script }, preview });
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
  preview.lastAccessAt = Date.now();
  const url = `http://127.0.0.1:${preview.port}`;
  const healthy = await probePreview(url);
  res.json({ ok: true, running: healthy, preview: healthy ? { projectName, port: preview.port, url, gatewayUrl:previewGatewayUrl(projectName), framework:preview.framework, packageManager:preview.packageManager, script:preview.script, status:preview.status, healthy } : null, status:healthy ? "running" : (preview.status || "starting"), lastOutput: preview.lastOutput || null, error:preview.error || null });
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
