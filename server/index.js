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
import { callWithFallback } from "./groqPool.js";
import { parseEditOutput, applyEdits } from "./utils/editParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/git", gitRouter);

/* ── POST /api/build — start a new build ────────────────────────────────── */
app.post("/api/build", dbRequired, async (req, res) => {
  const { description } = req.body;
  if (!description?.trim())
    return res.status(400).json({ error: "Description is required" });

  const build = await Build.create({
    description: description.trim(),
    status: "running",
    agents: AGENT_DEFS.map((a) => ({ name: a.name, status: "idle" })),
    files: [],
  });
  res.json({ buildId: build._id });
});

/* ── GET /api/build/:id/events — SSE stream ─────────────────────────────── */
app.get("/api/build/:id/events", dbRequired, async (req, res) => {
  let build;
  try { build = await Build.findById(req.params.id); } catch { /* fall through */ }
  if (!build) return res.status(404).json({ error: "Build not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  await runAgentPipeline(build, res, controller.signal);
  res.end();
});

/* ── GET /api/builds — recent builds (no file content) ──────────────────── */
app.get("/api/builds", dbRequired, async (req, res) => {
  const builds = await Build.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-agents.output -files.content")
    .lean();
  res.json(builds);
});

/* ── GET /api/build/:id — full build ────────────────────────────────────── */
app.get("/api/build/:id", dbRequired, async (req, res) => {
  try {
    const build = await Build.findById(req.params.id).lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── GET /api/build/:id/files — list files (no content) ─────────────────── */
app.get("/api/build/:id/files", dbRequired, async (req, res) => {
  try {
    const build = await Build.findById(req.params.id).select("files.agent files.path files.language").lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build.files || []);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── GET /api/build/:id/file?path=... — single file content ─────────────── */
app.get("/api/build/:id/file", dbRequired, async (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "path query param required" });
  try {
    const build = await Build.findById(req.params.id).select("files").lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    const file = build.files.find((f) => f.path === path);
    if (!file) return res.status(404).json({ error: "File not found" });
    res.json(file);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── POST /api/edit-files — targeted AI edit of existing build files ──────── */
app.post("/api/edit-files", dbRequired, async (req, res) => {
  const { buildId, instruction } = req.body;
  if (!buildId?.trim() || !instruction?.trim())
    return res.status(400).json({ error: "buildId and instruction are required" });

  let build;
  try { build = await Build.findById(buildId); } catch { /* fall through */ }
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

  // Build a compact snapshot of all files to send to the model
  const fileSummary = build.files.map(f =>
    `### FILE: ${f.path}\n\`\`\`${f.language || ""}\n${f.content}\n\`\`\``
  ).join("\n\n");

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
    const stream = await callWithFallback(client =>
      client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: `Current project files:\n\n${fileSummary}\n\nEdit instruction: ${instruction}\n\nApply the minimal changes:` },
        ],
        stream: true,
        max_tokens: 4000,
        temperature: 0.2,
      })
    );

    let fullOutput = "";
    let buffer = "";
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
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
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server on port ${PORT}`));
});
