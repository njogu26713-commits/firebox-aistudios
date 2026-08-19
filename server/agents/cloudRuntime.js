import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createBrowserRuntime } from "../../local-engine/browser.js";

const ALLOWED_COMMANDS = new Set(["npm", "npx", "pnpm", "yarn", "node", "python", "python3", "git", "pwd", "ls", "find", "cat", "echo", "clear", "mkdir", "rm"]);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clip = (value, limit = 6000) => String(value ?? "").slice(-limit);

function safePath(root, relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized === ".." || normalized.includes("../")) throw new Error(`Unsafe project path: ${relativePath}`);
  const target = path.resolve(root, normalized);
  const prefix = `${root}${path.sep}`;
  if (!target.startsWith(prefix)) throw new Error("Project path escapes the isolated workspace");
  return target;
}

function runProcess(command, args, cwd, onOutput = () => {}) {
  if (!ALLOWED_COMMANDS.has(command)) throw new Error(`Cloud Runtime command is not allowed: ${command}`);
  if (!Array.isArray(args) || args.some((arg) => /[;&|`$<>]/.test(String(arg)))) throw new Error("Unsafe Cloud Runtime command arguments");
  const normalizedArgs = args.map(String);
  if (command === "clear") {
    onOutput("\\x1b[2J\\x1b[H");
    return Promise.resolve({ ok: true, code: 0 });
  }
  const run = (actualCommand, actualArgs) => new Promise((resolve, reject) => {
    const child = spawn(actualCommand, actualArgs, { cwd, shell: false, detached: process.platform !== "win32", env: { ...process.env, TERM: process.env.TERM || "xterm-256color", COLORTERM: process.env.COLORTERM || "truecolor" } });
    child.stdout.on("data", (chunk) => onOutput(String(chunk)));
    child.stderr.on("data", (chunk) => onOutput(String(chunk)));
    child.on("error", (error) => {
      if (error.code === "ENOENT" && command === "pnpm") return run("npx", ["--yes", "pnpm", ...normalizedArgs]).then(resolve, reject);
      if (error.code === "ENOENT" && command === "yarn") return run("corepack", ["yarn", ...normalizedArgs]).then(resolve, reject);
      reject(error);
    });
    child.on("close", (code) => code === 0 ? resolve({ ok: true, code }) : reject(new Error(`${command} ${normalizedArgs.join(" ")} exited with code ${code}`)));
  });
  return run(command, normalizedArgs);
}

async function detectProjectRoot(workspaceRoot) {
  try {
    await fs.access(path.join(workspaceRoot, "package.json"));
    return workspaceRoot;
  } catch {}
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules");
  if (directories.length !== 1) return workspaceRoot;
  const candidate = path.join(workspaceRoot, directories[0].name);
  const markers = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "yarn.lock", "package-lock.json", "vite.config.js", "vite.config.ts", "src"];
  for (const marker of markers) {
    try { await fs.access(path.join(candidate, marker)); return candidate; } catch {}
  }
  return workspaceRoot;
}

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return response.ok || response.status < 500;
  } catch { return false; }
}

export async function createCloudRuntime({ build, emit = () => {} }) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), `firebox-cloud-${String(build._id)}-`));
  let projectRoot = workspaceRoot;
  let preview = null;
  let previewPort = 4173 + Math.floor(Math.random() * 1000);
  const runtime = {
    get workspace() { return projectRoot; },
    async syncFiles(files = []) {
      for (const file of files) {
        if (file.isBinary || file.content == null) continue;
        const target = safePath(workspaceRoot, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, String(file.content), "utf8");
      }
    },
    async runCommand(command, args = [], onOutput = () => {}) {
      return runProcess(command, args, projectRoot, (output) => { onOutput(output); emit("runtime-output", { output: clip(output) }); });
    },
    async installPackage(packageName) {
      return runtime.runCommand("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", String(packageName)]);
    },
    async startPreview() {
      if (preview?.child && preview.child.exitCode === null) return runtime.getPreviewStatus();
      const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"));
      const script = packageJson.scripts?.dev ? "dev" : packageJson.scripts?.start ? "start" : null;
      if (!script) throw new Error("Project has no dev or start script");
      previewPort += 1;
      const commandArgs = ["run", script, "--", "--host", "0.0.0.0", "--port", String(previewPort)];
      const child = spawn("npm", commandArgs, { cwd: projectRoot, shell: false, detached: process.platform !== "win32", env: { ...process.env, PORT: String(previewPort), TERM: process.env.TERM || "xterm-256color" } });
      preview = { child, port: previewPort, output: "" };
      child.stdout.on("data", (chunk) => { preview.output = clip(`${preview.output}${chunk}`); emit("runtime-output", { tool: "start_preview", output: clip(chunk) }); });
      child.stderr.on("data", (chunk) => { preview.output = clip(`${preview.output}${chunk}`); emit("runtime-output", { tool: "start_preview", output: clip(chunk) }); });
      child.on("error", (error) => { if (preview) preview.error = error.message; });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await probe(`http://127.0.0.1:${previewPort}`)) return runtime.getPreviewStatus();
        await sleep(500);
      }
      throw new Error(`Cloud preview did not become ready on port ${previewPort}. ${clip(preview.output, 1200)}`);
    },
    async getPreviewStatus() {
      if (!preview || preview.child.exitCode !== null || preview.child.killed) return { running: false, url: null, error: preview?.error || null };
      const url = `http://127.0.0.1:${preview.port}`;
      return { running: await probe(url), url, port: preview.port, output: preview.output || "" };
    },
  };
  await runtime.syncFiles(build.files || []);
  projectRoot = await detectProjectRoot(workspaceRoot);
  await runProcess("git", ["init"], projectRoot).catch(() => {});
  runtime.browser = createBrowserRuntime({ getPreviewStatus: () => runtime.getPreviewStatus(), emit });
  runtime.close = async () => {
    await runtime.browser.close().catch(() => {});
    if (preview?.child && preview.child.exitCode === null) {
      try { process.kill(-preview.child.pid, "SIGTERM"); } catch { preview.child.kill(); }
    }
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  };
  return runtime;
}
