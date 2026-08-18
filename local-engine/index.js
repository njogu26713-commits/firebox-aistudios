import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AGENT_DEFS } from "../server/agents/config.js";
import { extractFiles } from "../server/utils/fileParser.js";
import { getCompletionStream, normalizeAiConfig } from "../server/aiProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FIREBOX_ENGINE_PORT || 8787);
const TOKEN = String(process.env.FIREBOX_ENGINE_TOKEN || "").trim();
const WORKSPACE = path.resolve(process.env.FIREBOX_WORKSPACE || path.join(__dirname, "workspace"));
const OLLAMA_ENDPOINT = String(process.env.OLLAMA_ENDPOINT || "http://127.0.0.1:11434/v1").trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "").trim();
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || "").trim();
const jobs = new Map();

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

async function runBuild(job, res) {
  const projectDir = safeWorkspacePath(job.projectName);
  await fs.mkdir(projectDir, { recursive: true });
  const outputs = {};
  const config = normalizeAiConfig({ provider: "local", endpoint: job.endpoint, model: job.model, apiKey: job.apiKey });

  for (const agent of AGENT_DEFS) {
    send(res, "agent-start", { agent: agent.name, task: agent.task });
    const context = [`## App Description\n${job.description}`];
    for (const [name, output] of Object.entries(outputs)) context.push(`\n## ${name} Agent Output\n${output}`);
    const stream = await getCompletionStream({
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
    outputs[agent.name] = full;
    const files = extractFiles(agent.name, full);
    for (const file of files) {
      const absolute = safeWorkspacePath(file.path, projectDir);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, file.content, "utf8");
      send(res, "file-written", { agent: agent.name, path: file.path, language: file.language });
    }
    send(res, "agent-complete", { agent: agent.name, output: full, files });
  }

  try {
    await runProjectChecks(projectDir, (event, data) => send(res, event, data));
  } catch (error) {
    send(res, "tool-error", { message: error.message });
  }
  send(res, "build-complete", { projectName: job.projectName, workspace: projectDir });
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.get("origin") || "null");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

app.post("/api/test-ollama", auth, async (req, res) => {
  try {
    const config = normalizeAiConfig({ provider: "local", endpoint: req.body?.endpoint || OLLAMA_ENDPOINT, model: req.body?.model || OLLAMA_MODEL, apiKey: req.body?.apiKey || OLLAMA_API_KEY });
    const response = await fetch(`${config.endpoint.replace(/\/+$/, "")}/models`, { headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {} });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const models = Array.isArray(data.data) ? data.data.map((model) => model.id).filter(Boolean) : [];
    res.json({ ok: true, models, selectedModel: config.model, selectedModelAvailable: models.includes(config.model) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/build", auth, async (req, res) => {
  const { description, endpoint = OLLAMA_ENDPOINT, model = OLLAMA_MODEL, apiKey = OLLAMA_API_KEY, projectName } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: "Description is required" });
  if (!model?.trim()) return res.status(400).json({ error: "Local AI model is required" });
  const safeName = String(projectName || `firebox-project-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { id: jobId, description: description.trim(), endpoint, model, apiKey, projectName: safeName });
  res.json({ jobId, projectName: safeName });
});

app.get("/api/build/:id/events", auth, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Build job not found" });
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  try { await runBuild(job, res); } catch (error) { send(res, "build-error", { message: error.message }); }
  jobs.delete(job.id);
  res.end();
});

await fs.mkdir(WORKSPACE, { recursive: true });
app.listen(PORT, "127.0.0.1", () => console.log(`Firebox Local Engine listening on http://127.0.0.1:${PORT}`));
