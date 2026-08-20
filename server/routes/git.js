import express from "express";
import GithubToken from "../models/GithubToken.js";
import { requireAuth } from "./auth.js";
import Build from "../models/Build.js";
import { isDBConnected } from "../db.js";
import { callWithFallback } from "../groqPool.js";
import { parseEditOutput, applyEdits } from "../utils/editParser.js";
import { ANALYZE_AGENT_DEFS } from "../agents/analyzeConfig.js";
import { runAnalysisPipeline } from "../agents/analyzeRunner.js";
import crypto from "node:crypto";

const dbRequired = (req, res, next) => {
  if (!isDBConnected()) return res.status(503).json({ error: "Database not connected. Set MONGODB_URI to enable this feature." });
  next();
};

const router = express.Router();
const oauthStates = new Map();
const credentialId = userId => String(userId);
const getCredential = req => GithubToken.findOne({ ownerId: req.user._id }).select("+token").lean();

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

/* ── Source Control credentials ─────────────────────────────────────────── */
router.get("/token", dbRequired, requireAuth, async (req, res) => {
  try {
    const doc = await getCredential(req);
    res.json({ connected: Boolean(doc), provider: doc?.provider || null, username: doc?.username || "" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/token", dbRequired, requireAuth, async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) return res.status(400).json({ error: "token is required" });
  try {
    const user = await ghFetch("/user", token);
    await GithubToken.findOneAndUpdate({ ownerId:req.user._id }, { _id:credentialId(req.user._id), ownerId:req.user._id, provider:"pat", token, username:user.login || "", updatedAt:new Date() }, { upsert:true, new:true });
    res.json({ ok:true, connected:true, provider:"pat", username:user.login || "" });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/token", dbRequired, requireAuth, async (req, res) => {
  try { await GithubToken.deleteOne({ ownerId:req.user._id }); res.json({ ok:true }); }
  catch (err) { res.status(500).json({ error:err.message }); }
});

router.get("/oauth/start", dbRequired, requireAuth, async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) return res.status(503).json({ error:"GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Railway." });
  const state = crypto.randomBytes(24).toString("hex");
  oauthStates.set(state, { userId:String(req.user._id), expiresAt:Date.now() + 10 * 60 * 1000 });
  const redirectUri = process.env.GITHUB_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/git/oauth/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", redirectUri); url.searchParams.set("scope", "repo"); url.searchParams.set("state", state);
  res.json({ url:url.toString() });
});

router.get("/oauth/callback", dbRequired, async (req, res) => {
  const stateData = oauthStates.get(String(req.query.state || ""));
  oauthStates.delete(String(req.query.state || ""));
  if (!stateData || stateData.expiresAt < Date.now()) return res.status(400).send("GitHub OAuth state expired. Return to Firebox and try again.");
  if (req.query.error) return res.redirect("/?github=cancelled");
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", { method:"POST", headers:{Accept:"application/json", "Content-Type":"application/json"}, body:JSON.stringify({ client_id:process.env.GITHUB_CLIENT_ID, client_secret:process.env.GITHUB_CLIENT_SECRET, code:req.query.code, redirect_uri:process.env.GITHUB_OAUTH_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/git/oauth/callback` }) });
    const data = await response.json();
    if (!data.access_token) throw new Error(data.error_description || "GitHub OAuth did not return an access token");
    const user = await ghFetch("/user", data.access_token);
    await GithubToken.findOneAndUpdate({ ownerId:stateData.userId }, { _id:credentialId(stateData.userId), ownerId:stateData.userId, provider:"oauth", token:data.access_token, username:user.login || "", updatedAt:new Date() }, { upsert:true, new:true });
    res.redirect("/?github=connected");
  } catch (err) { res.redirect(`/?github=error&message=${encodeURIComponent(err.message)}`); }
});

/* ── GET /api/git/repos — list all repos for the saved credential ───────── */
router.get("/repos", dbRequired, requireAuth, async (req, res) => {
  try {
    const doc = await getCredential(req);
    if (!doc) return res.status(401).json({ error: "No GitHub connection. Choose OAuth or Personal Access Token first." });
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

/* ── POST /api/git/branches — list branches for a repository ────────────── */
router.post("/branches", dbRequired, requireAuth, async (req, res) => {
  const { owner, repo } = req.body;
  if (!owner || !repo) return res.status(400).json({ error: "owner and repo are required" });
  try {
    const credential = await getCredential(req);
    if (!credential?.token) return res.status(401).json({ error: "Connect GitHub before loading branches." });
    const branches = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=100`, credential.token);
    res.json(branches.map(branch => branch.name));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

/* ── POST /api/git/connect ───────────────────────────────────────────────── */
router.post("/connect", dbRequired, requireAuth, async (req, res) => {
  const { repoUrl, branch: requestedBranch } = req.body;
  if (!repoUrl?.trim()) return res.status(400).json({ error: "repoUrl is required" });
  try {
    const credential = await getCredential(req);
    if (!credential?.token) return res.status(401).json({ error: "Connect GitHub before opening a repository." });
    const { owner, repo } = parseRepoUrl(repoUrl);
    const info   = await ghFetch(`/repos/${owner}/${repo}`, credential.token);
    const branch = requestedBranch?.trim() || info.default_branch;
    const tree   = await ghFetch(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, credential.token
    );
    const files = (tree.tree || [])
      .filter(f => f.type === "blob")
      .map(f => ({ path: f.path, sha: f.sha, size: f.size }));
    res.json({
      owner, repo, branch, defaultBranch: info.default_branch, files,
      fullName: info.full_name,
      description: info.description || "",
      htmlUrl: info.html_url,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ── POST /api/git/repository/link — attach a GitHub repo to a project ─────── */
router.post("/repository/link", dbRequired, requireAuth, async (req, res) => {
  const buildId = String(req.body?.buildId || "");
  const owner = String(req.body?.owner || "").trim();
  const repo = String(req.body?.repo || "").trim();
  const branch = String(req.body?.branch || "").trim();
  const pushEnabled = req.body?.pushEnabled === true;
  if (!buildId || !owner || !repo || !branch) return res.status(400).json({ error:"buildId, owner, repo, and branch are required" });
  try {
    const credential = await getCredential(req);
    if (!credential) return res.status(401).json({ error:"Connect GitHub before linking a repository." });
    const build = await Build.findOne({ _id:buildId, ownerId:req.user._id });
    if (!build) return res.status(404).json({ error:"Project not found" });
    const info = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, credential.token);
    const next = { provider:"github", owner, name:repo, fullName:info.full_name, branch, defaultBranch:info.default_branch, htmlUrl:info.html_url, pushEnabled };
    build.repository = next;
    await build.save();
    res.json({ ok:true, repository:next });
  } catch (err) { res.status(400).json({ error:err.message }); }
});

/* ── POST /api/git/repository/create — create and optionally attach a repo ─── */
router.post("/repository/create", dbRequired, requireAuth, async (req, res) => {
  const buildId = String(req.body?.buildId || "");
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const isPrivate = req.body?.private !== false;
  const pushEnabled = req.body?.pushEnabled === true;
  if (!buildId || !/^[A-Za-z0-9._-]{1,100}$/.test(name)) return res.status(400).json({ error:"A valid repository name and buildId are required" });
  try {
    const credential = await getCredential(req);
    if (!credential) return res.status(401).json({ error:"Connect GitHub before creating a repository." });
    const build = await Build.findOne({ _id:buildId, ownerId:req.user._id });
    if (!build) return res.status(404).json({ error:"Project not found" });
    const created = await ghFetch("/user/repos", credential.token, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name, description, private:isPrivate, auto_init:false }) });
    const branch = "main";
    const next = { provider:"github", owner:created.owner.login, name:created.name, fullName:created.full_name, branch, defaultBranch:created.default_branch || branch, htmlUrl:created.html_url, pushEnabled };
    build.repository = next;
    await build.save();
    res.json({ ok:true, repository:next });
  } catch (err) { res.status(400).json({ error:err.message }); }
});

/* ── POST /api/git/repository/push — commit current project files to GitHub ── */
router.post("/repository/push", dbRequired, requireAuth, async (req, res) => {
  const buildId = String(req.body?.buildId || "");
  const message = String(req.body?.message || "Update project from Firebox").trim().slice(0, 200) || "Update project from Firebox";
  if (!buildId) return res.status(400).json({ error:"buildId is required" });
  try {
    const credential = await getCredential(req);
    if (!credential) return res.status(401).json({ error:"Connect GitHub before pushing changes." });
    const build = await Build.findOne({ _id:buildId, ownerId:req.user._id });
    if (!build) return res.status(404).json({ error:"Project not found" });
    const repository = build.repository?.toObject?.() || build.repository;
    if (!repository?.owner || !repository?.name || !repository?.branch) return res.status(409).json({ error:"Link or create a GitHub repository for this project first." });
    if (repository.pushEnabled !== true) return res.status(403).json({ error:"GitHub push is disabled for this project. Confirm push access in Source Control first." });
    const repoPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
    let parentCommit = null;
    try {
      const ref = await ghFetch(`${repoPath}/git/ref/heads/${encodeURIComponent(repository.branch)}`, credential.token);
      parentCommit = ref.object?.sha || null;
    } catch (err) {
      if (!/not found/i.test(err.message)) throw err;
    }
    const entries = [];
    for (const file of build.files || []) {
      if (!file.path || file.path.split("/").some(part => ["node_modules","dist","build",".next"].includes(part))) continue;
      const binary = file.encoding === "base64" || file.isBinary;
      const blob = await ghFetch(`${repoPath}/git/blobs`, credential.token, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ content:String(file.content || ""), encoding:binary ? "base64" : "utf-8" }) });
      entries.push({ path:file.path, mode:"100644", type:"blob", sha:blob.sha });
    }
    if (!entries.length) return res.status(400).json({ error:"This project has no files to push." });
    const treeBody = { tree:entries };
    if (parentCommit) {
      const parent = await ghFetch(`${repoPath}/git/commits/${parentCommit}`, credential.token);
      treeBody.base_tree = parent.tree?.sha;
    }
    const tree = await ghFetch(`${repoPath}/git/trees`, credential.token, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(treeBody) });
    const commit = await ghFetch(`${repoPath}/git/commits`, credential.token, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message, tree:tree.sha, ...(parentCommit ? { parents:[parentCommit] } : {}) }) });
    let refResult;
    try {
      refResult = await ghFetch(`${repoPath}/git/ref/heads/${encodeURIComponent(repository.branch)}`, credential.token, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ sha:commit.sha, force:false }) });
    } catch (err) {
      if (!/not found/i.test(err.message)) throw err;
      refResult = await ghFetch(`${repoPath}/git/refs`, credential.token, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ref:`refs/heads/${repository.branch}`, sha:commit.sha }) });
    }
    build.repository.lastPushAt = new Date();
    await build.save();
    res.json({ ok:true, commitSha:commit.sha, commitUrl:commit.html_url || `${repository.htmlUrl}/commit/${commit.sha}`, branch:repository.branch, files:entries.length, ref:refResult.ref });
  } catch (err) { res.status(400).json({ error:err.message }); }
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
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
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
router.post("/import-as-project", dbRequired, requireAuth, async (req, res) => {
  const { owner, repo, branch, files: fileTree } = req.body;
  if (!owner || !repo || !branch || !Array.isArray(fileTree))
    return res.status(400).json({ error: "owner, repo, branch and files are required" });
  const credential = await getCredential(req);
  if (!credential?.token) return res.status(401).json({ error: "Connect GitHub before importing a repository." });
  const token = credential.token;

  // Preserve every repository file except generated dependencies and build output.
  // Source assets, lockfiles, maps, configs, fonts, and documentation are valid
  // project files and must not be silently discarded during import.
  const SKIP_DIR = new Set([
    "node_modules",".git","dist","build",".next","coverage","vendor",
    "__pycache__",".cache","out",".turbo",
  ]);
  const BINARY_EXT = new Set(["png","jpg","jpeg","gif","webp","ico","bmp","avif","svg","woff","woff2","ttf","eot","otf","pdf","zip","gz","tar","7z","mp4","webm","mov","mp3","wav","ogg","flac","exe","dll","so","dylib"]);
  const filesToFetch = fileTree.filter(f => {
    const parts = String(f.path || "").split("/");
    return f.path && !parts.some(p => SKIP_DIR.has(p));
  });
  const toFetch = filesToFetch;

  // Fetch files in parallel (batches of 10 to avoid rate-limits)
  const fetchedFiles = [];
  for (let i = 0; i < toFetch.length; i += 10) {
    const batch = toFetch.slice(i, i + 10);
    const results = await Promise.all(batch.map(async f => {
      try {
        let data;
        try {
          data = await ghFetch(`/repos/${owner}/${repo}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`, token);
        } catch {
          // Contents API has size limits; the Git Blob API can retrieve larger files.
          data = await ghFetch(`/repos/${owner}/${repo}/git/blobs/${f.sha}`, token);
        }
        if (!data.content) throw new Error("GitHub returned no file content");
        const ext     = f.path.split(".").pop().toLowerCase();
        const isBinary = BINARY_EXT.has(ext);
        const content = isBinary ? data.content.replace(/\s/g, "") : Buffer.from(data.content, "base64").toString("utf8");
        const LANG_MAP = {
          js:"javascript", jsx:"javascript", ts:"typescript", tsx:"typescript",
          py:"python", json:"json", yml:"yaml", yaml:"yaml", md:"markdown",
          sh:"bash", html:"html", css:"css", scss:"css", go:"go",
          rs:"rust", rb:"ruby", toml:"ini", env:"bash",
        };
        const base     = f.path.split("/").pop().toLowerCase();
        const language = base === "dockerfile" ? "dockerfile" : (LANG_MAP[ext] || "plaintext");
        return { agent: "GitHub Import", path: f.path, content, language, encoding: isBinary ? "base64" : "utf8", isBinary };
      } catch { return null; }
    }));
    fetchedFiles.push(...results.filter(Boolean));
  }

  if (!fetchedFiles.length)
    return res.status(400).json({ error: "No readable files found in this repository" });

  const build = await Build.create({
    ownerId: req.user._id,
    description: `Imported from GitHub: ${owner}/${repo} (branch: ${branch})`,
    projectName: repo,
    status: "complete",
    importSource: "github",
    importMeta: { owner, repo, branch, fileCount: fetchedFiles.length },
    repository: { provider:"github", owner, name:repo, fullName:`${owner}/${repo}`, branch, defaultBranch:branch, htmlUrl:`https://github.com/${owner}/${repo}`, pushEnabled:false },
    agents: [],
    files:  fetchedFiles,
  });

  res.json({ buildId: build._id, filesCount: fetchedFiles.length });
});

/* ── POST /api/git/analyze — fetch repo files + start analysis build ──────── */
router.post("/analyze", dbRequired, requireAuth, async (req, res) => {
  const { owner, repo, branch, files: fileTree } = req.body;
  if (!owner || !repo || !branch || !Array.isArray(fileTree))
    return res.status(400).json({ error: "owner, repo, branch and files are required" });
  const credential = await getCredential(req);
  if (!credential?.token) return res.status(401).json({ error: "Connect GitHub before analyzing a repository." });
  const token = credential.token;

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
    ownerId: req.user._id,
    description: `GitHub Import Analysis: ${owner}/${repo}\n\n${repoContext}`,
    projectName: `${repo} analysis`,
    status: "running",
    agents: ANALYZE_AGENT_DEFS.map(a => ({ name: a.name, status: "idle" })),
    files:  [],
  });

  res.json({ buildId: build._id });
});

/* ── GET /api/git/analyze/:buildId/events — SSE analysis stream ──────────── */
router.get("/analyze/:buildId/events", dbRequired, requireAuth, async (req, res) => {
  let build;
  try { build = await Build.findOne({ _id: req.params.buildId, ownerId: req.user._id }); } catch { /* fall through */ }
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
