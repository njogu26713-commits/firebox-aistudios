import express from "express";
import Groq from "groq-sdk";
import GithubToken from "../models/GithubToken.js";
import { isDBConnected } from "../db.js";

const dbRequired = (req, res, next) => {
  if (!isDBConnected()) return res.status(503).json({ error: "Database not connected. Set MONGODB_URI to enable this feature." });
  next();
};

const router = express.Router();
let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

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

/* ── POST /api/git/ai-edit — AI-powered file edit (SSE) ─────────────────── */
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
    const stream = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are an expert code editor. The user will give you a file and an instruction.\n" +
            "Return ONLY the complete updated file content — no explanations, no markdown fences, " +
            "no commentary. Just the raw file text, ready to be written directly to disk.",
        },
        {
          role: "user",
          content:
            `File: ${path}\n\nCurrent content:\n${content}\n\nInstruction: ${instruction}\n\n` +
            "Return the complete updated file:",
        },
      ],
      stream:      true,
      max_tokens:  4000,
      temperature: 0.2,
    });

    let full = "";
    for await (const chunk of stream) {
      const tok = chunk.choices[0]?.delta?.content || "";
      if (!tok) continue;
      full += tok;
      sse({ token: tok });
    }
    sse({ done: true, content: full });
  } catch (err) {
    sse({ error: err.message });
  }
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
