import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, isDBConnected } from "./db.js";

const dbRequired = (req, res, next) => {
  if (!isDBConnected()) return res.status(503).json({ error: "Database not connected. Set MONGODB_URI to enable this feature." });
  next();
};
import Build from "./models/Build.js";
import { runAgentPipeline } from "./agents/runner.js";
import { AGENT_DEFS } from "./agents/config.js";
import gitRouter from "./routes/git.js";
import authRouter, { requireAuth } from "./routes/auth.js";
import { getCompletionStream, normalizeAiConfig, testLocalAi } from "./aiProvider.js";
import { parseEditOutput, applyEdits } from "./utils/editParser.js";
import { buildPlanningPrompt, normalizePlan } from "./agents/workflow.js";
import { createCloudRuntime } from "./agents/cloudRuntime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const cloudTerminalRuntimes = new Map();
const CLOUD_TERMINAL_IDLE_MS = 30 * 60 * 1000;
setInterval(async () => {
  const now = Date.now();
  for (const [buildId, session] of cloudTerminalRuntimes) {
    if (now - session.lastUsedAt > CLOUD_TERMINAL_IDLE_MS) {
      await session.runtime.close().catch(() => {});
      cloudTerminalRuntimes.delete(buildId);
    }
  }
}, 5 * 60 * 1000).unref();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/api/git", gitRouter);
app.use("/api/auth", authRouter);

/* ── POST /api/import/project — persist files from an external project source ── */
app.post("/api/import/project", dbRequired, requireAuth, async (req, res) => {
  const { projectName = "firebox-project", description = "Imported project", source = "upload", sourceMeta = {}, files } = req.body;
  if (!Array.isArray(files) || files.length === 0)
    return res.status(400).json({ error: "At least one project file is required" });
  const normalizedFiles = files
    .filter(file => file && typeof file.path === "string" && typeof file.content === "string")
    .map(file => ({
      agent: file.agent || (source === "github" ? "GitHub Import" : "ZIP Import"),
      path: file.path.replace(/^\/+/, "").replace(/\\/g, "/"),
      content: file.content,
      language: file.language || "plaintext",
      encoding: file.encoding === "base64" ? "base64" : "utf8",
      isBinary: Boolean(file.isBinary),
    }))
    .filter(file => file.path && file.path.length <= 500);
  if (!normalizedFiles.length)
    return res.status(400).json({ error: "No readable project files were supplied" });
  const estimatedBytes = normalizedFiles.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0);
  if (estimatedBytes > 14 * 1024 * 1024)
    return res.status(413).json({ error: "This project is too large to store as one Firebox project. Remove generated dependencies or build output and try again." });
  const build = await Build.create({
    ownerId: req.user._id,
    description: String(description || "Imported project").trim().slice(0, 500),
    projectName: String(projectName || "firebox-project").trim().slice(0, 120) || "firebox-project",
    status: "complete",
    agents: [],
    files: normalizedFiles,
    importSource: source,
    importMeta: sourceMeta,
  });
  res.json({ buildId: build._id, projectName: build.projectName, filesCount: normalizedFiles.length });
});

/* ── POST /api/build — start a new build ────────────────────────────────── */
app.post("/api/build", dbRequired, requireAuth, async (req, res) => {
  const { description, projectName = "firebox-project", provider = "cloud", localAi = {}, toolMode = false } = req.body;
  if (!description?.trim())
    return res.status(400).json({ error: "Description is required" });

  let aiConfig;
  try {
    aiConfig = normalizeAiConfig({ provider, ...localAi });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const build = await Build.create({
    ownerId: req.user._id,
    description: description.trim(),
    projectName: String(projectName || "firebox-project").trim().slice(0, 120) || "firebox-project",
    provider: aiConfig.provider,
    localAi: aiConfig.provider !== "cloud" ? aiConfig : undefined,
    status: "running",
    toolMode: Boolean(toolMode),
    agents: AGENT_DEFS.map((a) => ({ name: a.name, status: "idle" })),
    files: [],
  });
  res.json({ buildId: build._id, projectName: "firebox-project" });
});

/* ── GET /api/build/:id/events — SSE stream ─────────────────────────────── */
app.get("/api/build/:id/events", dbRequired, requireAuth, async (req, res) => {
  let build;
  try { build = await Build.findOne({ _id: req.params.id, ownerId: req.user._id }).select("+localAi.apiKey"); } catch { /* fall through */ }
  if (!build) return res.status(404).json({ error: "Build not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": firebox-heartbeat\\n\\n");
  }, 15000);
  req.on("close", () => controller.abort());

  try {
    await runAgentPipeline(build, res, controller.signal);
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

/* ── POST /api/build/:id/pause — pause at the next safe checkpoint ─────────── */
app.post("/api/build/:id/pause", dbRequired, requireAuth, async (req, res) => {
  try {
    const build = await Build.findOneAndUpdate({ _id: req.params.id, ownerId: req.user._id }, { $set: { executionState: "paused" } }, { new: true }).select("executionState status");
    if (!build) return res.status(404).json({ error: "Build not found" });
    if (build.status !== "running") return res.status(409).json({ error: "Build is not running", executionState: build.executionState });
    res.json({ ok: true, executionState: build.executionState });
  } catch { res.status(400).json({ error: "Unable to pause build" }); }
});

/* ── POST /api/build/:id/resume — resume a paused build ──────────────────── */
app.post("/api/build/:id/resume", dbRequired, requireAuth, async (req, res) => {
  try {
    const build = await Build.findOneAndUpdate({ _id: req.params.id, ownerId: req.user._id }, { $set: { executionState: "running" } }, { new: true }).select("executionState status");
    if (!build) return res.status(404).json({ error: "Build not found" });
    if (build.status !== "running") return res.status(409).json({ error: "Build is not running", executionState: build.executionState });
    res.json({ ok: true, executionState: build.executionState });
  } catch { res.status(400).json({ error: "Unable to resume build" }); }
});

/* ── GET /api/builds — recent builds (no file content) ──────────────────── */
app.get("/api/builds", dbRequired, requireAuth, async (req, res) => {
  const builds = await Build.find({ ownerId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-agents.output -files.content")
    .lean();
  res.json(builds);
});

/* ── GET /api/build/:id — full build ────────────────────────────────────── */
app.get("/api/build/:id", dbRequired, requireAuth, async (req, res) => {
  try {
    const build = await Build.findOne({ _id: req.params.id, ownerId: req.user._id }).lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── GET /api/build/:id/files — list files (no content) ─────────────────── */
app.get("/api/build/:id/files", dbRequired, requireAuth, async (req, res) => {
  try {
    const build = await Build.findOne({ _id: req.params.id, ownerId: req.user._id }).select("files.agent files.path files.language").lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build.files || []);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── GET /api/build/:id/file?path=... — single file content ─────────────── */
app.post("/api/terminal", dbRequired, requireAuth, async (req, res) => {
  const buildId = String(req.body?.buildId || "").trim();
  const rawCommand = String(req.body?.command || "").trim();
  if (!buildId || !rawCommand) return res.status(400).json({ ok:false, error:"A project and command are required." });
  if (/[;&|`$<>]/.test(rawCommand)) return res.status(400).json({ ok:false, error:"Shell operators are not allowed in the Terminal command." });
  const parts = rawCommand.split(/\s+/);
  const [command, ...args] = parts;
  if (!["npm", "npx", "pnpm", "yarn", "node", "python", "python3", "git"].includes(command)) return res.status(400).json({ ok:false, error:"This command is not allowed in the Cloud Terminal." });
  const build = await Build.findOne({ _id: buildId, ownerId: req.user._id });
  if (!build) return res.status(404).json({ ok:false, error:"Project not found." });
  let session = cloudTerminalRuntimes.get(buildId);
  if (!session) {
    session = { runtime: await createCloudRuntime({ build }), lastUsedAt: Date.now() };
    cloudTerminalRuntimes.set(buildId, session);
  } else {
    await session.runtime.syncFiles(build.files || []);
    session.lastUsedAt = Date.now();
  }
  const output = [];
  try {
    await session.runtime.runCommand(command, args, (chunk) => output.push(String(chunk)));
    res.json({ ok:true, source:"user", runtime:"cloud-project", buildId, command:rawCommand, cwd:session.runtime.workspace, output:output.join("").slice(-20000) });
  } catch (error) {
    res.status(400).json({ ok:false, source:"user", runtime:"cloud-project", buildId, command:rawCommand, cwd:session.runtime.workspace, output:output.join("").slice(-20000), error:error.message });
  }
});

app.get("/api/build/:id/file", dbRequired, requireAuth, async (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "path query param required" });
  try {
    const build = await Build.findOne({ _id: req.params.id, ownerId: req.user._id }).select("files").lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    const file = build.files.find((f) => f.path === path);
    if (!file) return res.status(404).json({ error: "File not found" });
    res.json(file);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── DELETE /api/build/:id — permanently delete a build ─────────────────── */
app.delete("/api/build/:id", dbRequired, requireAuth, async (req, res) => {
  try {
    const result = await Build.findOneAndDelete({ _id: req.params.id, ownerId: req.user._id });
    if (!result) return res.status(404).json({ error: "Build not found" });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Invalid build id" });
  }
});

/* ── POST /api/plan — understand a build request before execution ─────────── */
app.post("/api/plan", requireAuth, async (req, res) => {
  const { description, fileNames = [], provider = "cloud", localAi = {} } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: "Description is required" });
  let aiConfig;
  try {
    aiConfig = normalizeAiConfig({ provider, ...localAi });
    const stream = await getCompletionStream({
      config: aiConfig,
      messages: [{ role: "user", content: buildPlanningPrompt({ description: description.trim(), fileNames }) }],
      maxTokens: 900,
      temperature: 0.2,
    });
    let raw = "";
    for await (const chunk of stream) {
      raw += typeof chunk === "string" ? chunk : chunk.choices?.[0]?.delta?.content || "";
    }
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
    let plan;
    try { plan = normalizePlan(JSON.parse(jsonText || raw)); }
    catch { plan = normalizePlan({ summary: raw.replace(/```json|```/g, "").trim() }); }
    res.json({ ok: true, plan });
  } catch (err) {
    console.error("[Planning Agent] request failed", { provider, message: err?.message, stack: err?.stack });
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ── POST /api/chat — conversational AI with optional action trigger ─────── */
app.post("/api/chat", requireAuth, async (req, res) => {
  const { messages = [], hasFiles = false, fileNames = [], provider = "cloud", localAi = {} } = req.body;
  let aiConfig;
  try {
    aiConfig = normalizeAiConfig({ provider, ...localAi });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const sse = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const fileContext = hasFiles && fileNames.length > 0
    ? `\nThe user currently has a project open with these files: ${fileNames.slice(0, 20).join(", ")}.`
    : "\nThe user has no project files open yet.";

  const systemPrompt =
    `You are an AI coding assistant inside Firebox AI Studio, similar to Replit's AI assistant. ` +
    `You can chat naturally, answer coding questions, suggest ideas, help plan apps, and take actions.` +
    fileContext +
    `\n\nIMPORTANT — action tags must ONLY be added when the user gives a direct, unambiguous command to act. Follow these rules strictly:` +
    `\n\n[ACTION:build] — ONLY add this when the user gives an explicit command to build/create a project, such as "build me a...", "create a...", "make a...", "start building...", "generate a...". Do NOT add this for questions, ideas, brainstorming, planning discussions, or anything where the user is asking for advice or information — even if the topic is about an app they might want to build.` +
    `\n[ACTION:edit] — ONLY add this when the user explicitly asks to change/update/fix/add to the existing project files, such as "change the color to...", "add a login page", "fix the bug in...".` +
    `\n\nWhen in doubt, do NOT add any action tag. Questions, requests for advice, brainstorming, and anything that is not a direct build or edit command should NEVER trigger an action.` +
    `\n\nKeep replies concise and friendly. When you're about to build or edit (and only when you're certain the user asked you to), briefly explain what you'll do first, then put the action tag on its own last line.`;

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
  ];

  try {
    const stream = await getCompletionStream({
      config: aiConfig,
      messages: groqMessages,
      maxTokens: 800,
      temperature: 0.5,
    });

    let full = "";
    let buffer = "";
    for await (const chunk of stream) {
      const tok = typeof chunk === "string"
        ? chunk
        : chunk.choices?.[0]?.delta?.content || "";
      if (!tok) continue;
      full += tok;
      buffer += tok;
      if (buffer.length >= 15) { sse({ token: buffer }); buffer = ""; }
    }
    if (buffer) sse({ token: buffer });

    // Parse action tag from end of response
    const actionMatch = full.match(/\[ACTION:(build|edit)\]\s*$/);
    const action = actionMatch ? actionMatch[1] : null;
    const text = full.replace(/\[ACTION:(build|edit)\]\s*$/, "").trimEnd();

    sse({ done: true, text, action });
  } catch (err) {
    sse({ error: err.message });
  }
  res.end();
});

/* ── POST /api/edit-files — targeted AI edit of existing build files ──────── */
app.post("/api/edit-files", dbRequired, requireAuth, async (req, res) => {
  const { buildId, instruction, provider = "cloud", localAi = {} } = req.body;
  let aiConfig;
  try {
    aiConfig = normalizeAiConfig({ provider, ...localAi });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!buildId?.trim() || !instruction?.trim())
    return res.status(400).json({ error: "buildId and instruction are required" });

  let build;
  try { build = await Build.findOne({ _id: buildId, ownerId: req.user._id }).select("+localAi.apiKey"); } catch { /* fall through */ }
  if (!build) return res.status(404).json({ error: "Build not found" });
  if (!build.files?.length)
    return res.status(400).json({ error: "Build has no files to edit" });

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Build a bounded, editable snapshot. Binary assets and generated dependency/build folders are not useful to the text editor model.
  const editableFiles = build.files.filter((file) => {
    const path = String(file.path || "");
    return !file.isBinary && !/^node_modules\//.test(path) && !/^(dist|build|coverage)\//.test(path);
  });
  const fileSummary = editableFiles.map((file) => {
    const content = String(file.content || "");
    const bounded = content.length > 14000 ? `${content.slice(0, 14000)}\n/* Firebox truncated this file for context; use the exact visible section only. */` : content;
    return `### FILE: ${file.path}\n\`\`\`${file.language || ""}\n${bounded}\n\`\`\``;
  }).join("\n\n").slice(0, 220000);

  sse("edit-start", { filesCount: build.files.length });

  const systemPrompt = `You are an expert code editor embedded in an AI coding assistant (like Replit).
The user will give you a set of project files and an edit instruction.
Make ONLY the minimal, targeted changes needed. Never rewrite entire files.

For each file that needs changing, use this EXACT format:

### FILE: path/to/file.ext
<<<<<<< SEARCH
exact text from the current file (must match verbatim, include enough context to be unique)
=======
replacement text
>>>>>>> REPLACE

Rules:
- Only output files that actually need changes.
- SEARCH text must match the current file content exactly (whitespace included).
- Use as many SEARCH/REPLACE blocks per file as needed.
- Never output a whole-file replacement — always use SEARCH/REPLACE.
- If a new file must be created, use ### FILE: with a fenced code block instead.`;

  try {
    const stream = await getCompletionStream({
      config: aiConfig,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Current project files (binary and generated folders omitted; some very large files may be truncated):\n\n${fileSummary}\n\nEdit instruction: ${instruction}\n\nApply the minimal changes. If the requested file is not present in the supplied context, first explain that it needs to be inspected rather than inventing SEARCH text:` },
      ],
      maxTokens: 4000,
      temperature: 0.2,
    });

    let fullOutput = "";
    let buffer = "";
    for await (const chunk of stream) {
      const token = typeof chunk === "string"
        ? chunk
        : chunk.choices?.[0]?.delta?.content || "";
      if (!token) continue;
      fullOutput += token;
      buffer += token;
      if (buffer.length >= 30) { sse("edit-token", { token: buffer }); buffer = ""; }
    }
    if (buffer) sse("edit-token", { token: buffer });

    // Parse and apply edits
    const edits = parseEditOutput(fullOutput);
    const changedFiles = [];

    for (const [filePath, fileEdits] of Object.entries(edits)) {
      const existing = build.files.find(f => f.path === filePath);
      if (existing) {
        // Existing file: only hunks are accepted — fullContent would overwrite the whole file
        if (!fileEdits.hunks?.length) {
          sse("edit-file-error", { path: filePath, message: `No SEARCH/REPLACE blocks found for ${filePath}. File unchanged.` });
          continue;
        }
        const { content: newContent, applied, failed } = applyEdits(existing.content, fileEdits);
        if (applied === 0) {
          // No hunk matched — leave file untouched
          sse("edit-file-error", { path: filePath, message: `${failed} change${failed !== 1 ? "s" : ""} failed to apply for ${filePath} — SEARCH text didn't match. File unchanged.` });
          continue;
        }
        existing.content = newContent;
        changedFiles.push({ path: filePath, applied, failed });
        sse("edit-file-updated", { path: filePath, content: newContent, applied, failed });
      } else {
        // New file: require a complete fenced body — hunk-only output can't create a file
        if (!fileEdits.fullContent?.trim()) {
          sse("edit-file-error", { path: filePath, message: `Skipped creating ${filePath} — the AI returned diff hunks for a new file instead of a full file body.` });
          continue;
        }
        const newFile = {
          agent: "Editor",
          path: filePath,
          content: fileEdits.fullContent,
          language: filePath.split(".").pop() || "plaintext",
        };
        build.files.push(newFile);
        changedFiles.push({ path: filePath, applied: 1, failed: 0, isNew: true });
        sse("edit-file-updated", { path: filePath, content: newFile.content, isNew: true });
      }
    }

    // Persist
    build.markModified("files");
    await build.save();

    sse("edit-complete", { filesChanged: changedFiles.length, files: changedFiles });
  } catch (err) {
    sse("edit-error", { message: err.message });
  }
  res.end();
});

/* ── Test a user-configured Local AI endpoint/model ──────────────────────── */
app.post("/api/test-local-ai", async (req, res) => {
  try {
    const result = await testLocalAi(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/* ── Deployment health diagnostics ───────────────────────────────────────── */
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "firebox-ai-studio", database: isDBConnected() ? "connected" : "unavailable" });
});

/* ── Serve built frontend in production ──────────────────────────────────── */
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for any non-API route
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`[startup] health endpoint: /health | db configured: ${Boolean(process.env.MONGODB_URI)}`);
});
connectDB().then(() => {
  console.log(`[startup] database status: ${isDBConnected() ? "connected" : "unavailable"}`);
}).catch((error) => {
  console.error(`[startup] database initialization failed: ${error.message}`);
});

export { app, server };
