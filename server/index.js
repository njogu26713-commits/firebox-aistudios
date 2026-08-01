import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./db.js";
import Build from "./models/Build.js";
import { runAgentPipeline } from "./agents/runner.js";
import { AGENT_DEFS } from "./agents/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

/* ── POST /api/build — start a new build ────────────────────────────────── */
app.post("/api/build", async (req, res) => {
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
app.get("/api/build/:id/events", async (req, res) => {
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
app.get("/api/builds", async (req, res) => {
  const builds = await Build.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-agents.output -files.content")
    .lean();
  res.json(builds);
});

/* ── GET /api/build/:id — full build ────────────────────────────────────── */
app.get("/api/build/:id", async (req, res) => {
  try {
    const build = await Build.findById(req.params.id).lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── GET /api/build/:id/files — list files (no content) ─────────────────── */
app.get("/api/build/:id/files", async (req, res) => {
  try {
    const build = await Build.findById(req.params.id).select("files.agent files.path files.language").lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build.files || []);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/* ── GET /api/build/:id/file?path=... — single file content ─────────────── */
app.get("/api/build/:id/file", async (req, res) => {
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
