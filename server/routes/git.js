import express from "express";
import GithubToken from "../models/GithubToken.js";
import Build from "../models/Build.js";
import { isDBConnected } from "../db.js";
import { callWithFallback } from "../groqPool.js";
import { parseEditOutput, applyEdits } from "../utils/editParser.js";
import { ANALYZE_AGENT_DEFS } from "../agents/analyzeConfig.js";
import { runAnalysisPipeline } from "../agents/analyzeRunner.js";

const dbRequired = (req, res, next) => {
  if (!isDBConnected()) return res.status(503).json({ error: "Database not connected. Set MONGODB_URI to enable this feature." });
  next();
};

const router = express.Router();

/* ── GitHub API helper ───────────────────────────────────────────────────── */
async function ghFetch(path, token, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent":  "Firebox-AI-Studio",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({ message: res.statusText }));
  if (!res.ok) throw new Error(body.message || `GitHub API ${res.status}`);
  return body;
}

function parseRepoUrl(url) {
  const clean = url.trim().replace(/\.git$/, "");
  const m = clean.match(/(?:github\.com\/)([^/\s]+)\/([^/\s]+)/);
  if (!m) throw new Error("Invalid GitHub URL — expected github.com/owner/repo");
  return { owner: m[1], repo: m[2] };
}

/* ── GET /api/git/token — retrieve saved token ──────────────────────────── */
router.get("/token", dbRequired, async (req, res) => {
  try {
    const doc = await GithubToken.findById("singleton").lean();
    if (!doc) return res.json({ token: null });
    res.json({ token: doc.token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/git/token — save token ───────────────────────────────────── */
router.post("/token", dbRequired, async (req, res) => {
  const { token } = req.body;
  if (!token?.trim()) return res.status(400).json({ error: "token is required" });
  try {
    await GithubToken.findByIdAndUpdate(
      "singleton",
      { token: token.trim(), createdAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE /api/git/token — remove saved token ─────────────────────────── */
router.delete("/token", dbRequired, async (req, res) => {
  try {
    await GithubToken.findByIdAndDelete("singleton");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/git/repos — list all repos for the saved token ────────────── */
router.get("/repos", dbRequired, async (req, res) => {
  try {
    const doc = await GithubToken.findById("singleton").lean();
    if (!doc) return res.status(401).json({ error: "No token saved. Please connect your GitHub account first." });
    const token = doc.token;

    // Fetch up to 100 repos sorted by last updated
    const repos = await ghFetch(
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      token
    );
    res.json(repos.map(r => ({
      id:          r.id,
      fullName:    r.full_name,
      owner:       r.owner.login,
      name:        r.name,
      description: r.description || "",
      private:     r.private,
      htmlUrl:     r.html_url,
      language:    r.language || "",
      updatedAt:   r.updated_at,
      defaultBranch: r.default_branch,
    })));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── POST /api/git/connect ───────────────────────────────────────────────── */
router.post("/connect", async (req, res) => {
  const { repoUrl, token } = req.body;
  if (!repoUrl?.trim() || !token?.trim())
    return res.status(400).json({ error: "repoUrl and token are required" });
  try {
    const { owner, repo } = parseRepoUrl(repoUrl);
    const info   = await ghFetch(`/repos/${owner}/${repo}`, token);
    const branch = info.default_branch;
    const tree   = await ghFetch(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token
    );
    const files = (tree.tree || [])
      .filter(f => f.type === "blob")
      .map(f => ({ path: f.path, sha: f.sha, size: f.size }));
    res.json({
      owner, repo, branch, files,
      fullName: info.full_name,
      description: info.description || "",
      htmlUrl: info.html_url,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── POST /api/git/file — fetch one file's content ───────────────────────── */
router.post("/file", async (req, res) => {
  const { owner, repo, path, token } = req.body;
  if (!owner || !repo || !path || !token)
    return res.status(400).json({ error: "owner, repo, path, token required" });
  try {
    const data    = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, token);
    const content = Buffer.from(data.content, "base64").toString("utf8");
    res.json({ content, sha: data.sha });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── POST /api/git/ai-edit — AI-powered file edit using search/replace (SSE) */
router.post("/ai-edit", async (req, res) => {
  const { content, path, instruction } = req.body;
  if (!content || !instruction)
    return res.status(400).json({ error: "content and instruction required" });

  res.writeHead(200, {
    "Content-Type":    "text/event-stream",
    "Cache-Control":   "no-cache",
    Connection:        "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const sse = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const stream = await callWithFallback(client =>
      client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are an expert code editor embedded in an AI coding assistant (like Replit).\n" +
              "The user will give you a file and an edit instruction.\n" +
              "Make ONLY the minimal, targeted changes needed — never rewrite the entire file.\n\n" +
              "Use this EXACT format for every change:\n\n" +
              "<<<<<<< SEARCH\n" +
              "exact text from the current file (must match verbatim)\n" +
              "=======\n" +
              "replacement text\n" +
              ">>>>>>> REPLACE\n\n" +
              "Rules:\n" +
              "- SEARCH text must match the file exactly (including whitespace).\n" +
              "- Include enough surrounding lines so each SEARCH block is unique.\n" +
              "- Use multiple SEARCH/REPLACE blocks if needed.\n" +
              "- Output ONLY the diff blocks — no explanations, no full file.",
          },
          {
            role: "user",
            content:
              `File: ${path}\n\nCurrent content:\n${content}\n\nInstruction: ${instruction}\n\n` +
              "Apply the minimal changes using SEARCH/REPLACE blocks:",
          },
        ],
        stream:      true,
        max_tokens:  4000,
        temperature: 0.2,
      })
    );

    let full = "";
    for await (const chunk of stream) {
      const tok = chunk.choices[0]?.delta?.content || "";
      if (!tok) continue;
      full += tok;
      sse({ token: tok });
    }

    // Parse and apply the search/replace hunks server-side.
    // This is always an existing file, so fullContent is rejected — it would overwrite the file.
    const parsed = parseEditOutput(`### FILE: ${path}\n${full}`);
    const fileEdits = parsed[path];
    const hasHunks = fileEdits?.hunks?.length > 0;

    if (!fileEdits || !hasHunks) {
      // No recognisable diff markers (or only a fenced full-file block) — return original unchanged
      sse({ done: true, content, error: "The AI did not return valid SEARCH/REPLACE blocks. The file was not changed. Try rephrasing your instruction." });
    } else {
      const { content: newContent, applied, failed } = applyEdits(content, fileEdits);
      if (applied === 0) {
        // Hunks parsed but none matched — return original to avoid data loss
        sse({ done: true, content, error: `${failed} SEARCH block${failed !== 1 ? "s" : ""} did not match the file content. The file was not changed. Try rephrasing your instruction.` });
      } else if (failed > 0) {
        // Partial application — return patched content with a warning
        sse({ done: true, content: newContent, warning: `${failed} of ${applied + failed} change${applied + failed !== 1 ? "s" : ""} could not be applied (SEARCH text didn't match).` });
      } else {
        sse({ done: true, content: newContent });
      }
    }
  } catch (err) {
    sse({ error: err.message });
  }
  res.end();
});

/* ── POST /api/git/import-as-project — save repo files as an editable Build ── */
router.post("/import-as-project", dbRequired, async (req, res) => {
  const { owner, repo, branch, token, files: fileTree } = req.body;
  if (!owner || !repo || !branch || !token || !Array.isArray(fileTree))
    return res.status(400).json({ error: "owner, repo, branch, token and files are required" });

  const SKIP_EXT = new Set([
    "png","jpg","jpeg","gif","svg","ico","woff","woff2","ttf","eot","otf",
    "pdf","zip","gz","tar","mp4","webm","mp3","wav","ogg","exe","dll","so",
    "lock","map","min.js","min.css",
  ]);
  const SKIP_DIR = new Set([
    "node_modules",".git","dist","build",".next","coverage","vendor",
    "__pycache__",".cache","out",".turbo",
  ]);

  const filteredFiles = fileTree.filter(f => {
    const parts = f.path.split("/");
    if (parts.some(p => SKIP_DIR.has(p))) return false;
    const ext = f.path.split(".").pop().toLowerCase();
    if (SKIP_EXT.has(ext)) return false;
    if (f.size && f.size > 150_000) return false; // skip files > 150 KB
    return true;
  });

  // Sort: smaller files first so we get maximum variety within the cap
  filteredFiles.sort((a, b) => (a.size || 0) - (b.size || 0));

  const MAX_FILES = 60;
  const toFetch   = filteredFiles.slice(0, MAX_FILES);

  // Fetch files in parallel (batches of 10 to avoid rate-limits)
  const fetchedFiles = [];
  for (let i = 0; i < toFetch.length; i += 10) {
    const batch = toFetch.slice(i, i + 10);
    const results = await Promise.all(batch.map(async f => {
      try {
        const data    = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}?ref=${branch}`, token);
        const content = Buffer.from(data.content, "base64").toString("utf8");
        const ext     = f.path.split(".").pop().toLowerCase();
        const LANG_MAP = {
          js:"javascript", jsx:"javascript", ts:"typescript", tsx:"typescript",
          py:"python", json:"json", yml:"yaml", yaml:"yaml", md:"markdown",
          sh:"bash", html:"html", css:"css", scss:"css", go:"go",
          rs:"rust", rb:"ruby", toml:"ini", env:"bash",
        };
        const base     = f.path.split("/").pop().toLowerCase();
        const language = base === "dockerfile" ? "dockerfile" : (LANG_MAP[ext] || "plaintext");
        return { agent: "GitHub Import", path: f.path, content, language };
      } catch { return null; }
    }));
    fetchedFiles.push(...results.filter(Boolean));
  }

  if (!fetchedFiles.length)
    return res.status(400).json({ error: "No readable files found in this repository" });

  const build = await Build.create({
    description: `Imported from GitHub: ${owner}/${repo} (branch: ${branch})`,
    projectName: repo,
    status: "complete",
    agents: [],
    files:  fetchedFiles,
  });

  res.json({ buildId: build._id, filesCount: fetchedFiles.length });
});

/* ── POST /api/git/analyze — fetch repo files + start analysis build ──────── */
router.post("/analyze", dbRequired, async (req, res) => {
  const { owner, repo, branch, token, files: fileTree } = req.body;
  if (!owner || !repo || !branch || !token || !Array.isArray(fileTree))
    return res.status(400).json({ error: "owner, repo, branch, token and files are required" });

  // Decide which files to fetch (skip binaries, lock files, large assets)
  const SKIP_EXT  = new Set(["png","jpg","jpeg","gif","svg","ico","woff","woff2","ttf","eot","pdf","zip","gz","mp4","webm","mp3","lock","map","min.js","min.css"]);
  const SKIP_DIR  = new Set(["node_modules",".git","dist","build",".next","coverage","vendor","__pycache__"]);
  const PRIORITY  = ["README.md","readme.md","package.json",".env.example","docker-compose.yml","Dockerfile","server/index.js","index.js","app.js","main.js","src/App.jsx","src/App.tsx","src/main.jsx","src/main.tsx"];

  const filteredFiles = fileTree.filter(f => {
    const parts = f.path.split("/");
    if (parts.some(p => SKIP_DIR.has(p))) return false;
    const ext = f.path.split(".").pop().toLowerCase();
    if (SKIP_EXT.has(ext)) return false;
    if (f.size && f.size > 80000) return false; // skip very large files
    return true;
  });

  // Sort: priority files first, then by size ascending
  filteredFiles.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.path);
    const pb = PRIORITY.indexOf(b.path);
    if (pa !== -1 && pb !== -1) return pa - pb;
    if (pa !== -1) return -1;
    if (pb !== -1) return 1;
    return (a.size || 0) - (b.size || 0);
  });

  // Fetch up to 20 files, cap each at 3000 chars
  const MAX_FILES = 20;
  const MAX_CHARS = 3000;
  const toFetch   = filteredFiles.slice(0, MAX_FILES);

  const fetchedFiles = [];
  await Promise.all(toFetch.map(async f => {
    try {
      const data    = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}?ref=${branch}`, token);
      const content = Buffer.from(data.content, "base64").toString("utf8").slice(0, MAX_CHARS);
      fetchedFiles.push({ path: f.path, content });
    } catch { /* skip files that fail */ }
  }));

  // Build the repo context string passed to all analysis agents
  const repoContext = [
    `Repository: ${owner}/${repo}  (branch: ${branch})`,
    `Total files in repo: ${fileTree.length}  |  Files included below: ${fetchedFiles.length}`,
    "",
    ...fetchedFiles.map(f =>
      `### ${f.path}\n\`\`\`\n${f.content}${f.content.length >= MAX_CHARS ? "\n… (truncated)" : ""}\n\`\`\``
    ),
  ].join("\n");

  // Create a Build record using the analysis agent definitions
  const build = await Build.create({
    description: `GitHub Import Analysis: ${owner}/${repo}\n\n${repoContext}`,
    projectName: `${repo} analysis`,
    status: "running",
    agents: ANALYZE_AGENT_DEFS.map(a => ({ name: a.name, status: "idle" })),
    files:  [],
  });

  res.json({ buildId: build._id });
});

/* ── GET /api/git/analyze/:buildId/events — SSE analysis stream ──────────── */
router.get("/analyze/:buildId/events", dbRequired, async (req, res) => {
  let build;
  try { build = await Build.findById(req.params.buildId); } catch { /* fall through */ }
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

  // The repo context was stored as part of the description after the first newline pair
  const repoContext = build.description.replace(/^GitHub Import Analysis: [^\n]+\n\n/, "");
  await runAnalysisPipeline(build, repoContext, res, controller.signal);
  res.end();
});

/* ── POST /api/git/push — commit a file back to GitHub ──────────────────── */
router.post("/push", async (req, res) => {
  const { owner, repo, branch, path, content, sha, token, message } = req.body;
  if (!owner || !repo || !path || content === undefined || !token)
    return res.status(400).json({ error: "owner, repo, path, content, token required" });
  try {
    const encoded = Buffer.from(content).toString("base64");
    const body    = {
      message: message?.trim() || `AI edit: update ${path}`,
      content: encoded,
      branch,
      ...(sha ? { sha } : {}),
    };
    const result = await ghFetch(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      token,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    res.json({
      success:   true,
      commitSha: result.commit?.sha,
      commitUrl: result.commit?.html_url,
      fileUrl:   result.content?.html_url,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
