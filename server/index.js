import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./db.js";
import Build from "./models/Build.js";
import { runAgentPipeline } from "./agents/runner.js";
import { AGENT_DEFS } from "./agents/config.js";

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/build — create a new build and return its ID
app.post("/api/build", async (req, res) => {
  const { description } = req.body;
  if (!description?.trim()) {
    return res.status(400).json({ error: "Description is required" });
  }

  const build = await Build.create({
    description: description.trim(),
    status: "running",
    agents: AGENT_DEFS.map((a) => ({ name: a.name, status: "idle" })),
  });

  res.json({ buildId: build._id });
});

// GET /api/build/:id/events — SSE stream of agent events
app.get("/api/build/:id/events", async (req, res) => {
  let build;
  try {
    build = await Build.findById(req.params.id);
  } catch {
    return res.status(404).json({ error: "Build not found" });
  }
  if (!build) return res.status(404).json({ error: "Build not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  await runAgentPipeline(build, res, controller.signal);
  res.end();
});

// GET /api/builds — recent builds (last 20)
app.get("/api/builds", async (req, res) => {
  const builds = await Build.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .select("-agents.output") // exclude large outputs from list
    .lean();
  res.json(builds);
});

// GET /api/build/:id — full build with all agent outputs
app.get("/api/build/:id", async (req, res) => {
  try {
    const build = await Build.findById(req.params.id).lean();
    if (!build) return res.status(404).json({ error: "Not found" });
    res.json(build);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Backend running on port ${PORT}`);
  });
});
