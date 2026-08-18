// Firebox-controlled local project tools. Models never receive direct filesystem or shell handles.

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const COMMAND_ALLOWLIST = new Set(["npm", "npm.cmd", "node"]);

export function safeWorkspacePath(relativePath, root) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized === ".." || normalized.includes("../")) {
    throw new Error(`Unsafe project path: ${relativePath}`);
  }
  const absolute = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) throw new Error("Path escapes the Firebox workspace");
  return absolute;
}

async function runAllowlisted(command, args, cwd, onOutput = () => {}) {
  if (!COMMAND_ALLOWLIST.has(command)) throw new Error(`Command is not allowed: ${command}`);
  if (!Array.isArray(args) || args.some((arg) => /[;&|`$<>]/.test(String(arg)))) throw new Error("Unsafe command arguments");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args.map(String), { cwd, shell: false, windowsHide: true });
    child.stdout.on("data", (chunk) => onOutput(String(chunk)));
    child.stderr.on("data", (chunk) => onOutput(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ code }) : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`)));
  });
}

export function createProjectTools({ root, emit = () => {} }) {
  const resolve = (relativePath) => safeWorkspacePath(relativePath, root);
  const withTool = async (name, input, action) => {
    emit("tool-start", { tool: name, input });
    try {
      const result = await action();
      emit("tool-complete", { tool: name });
      return result;
    } catch (error) {
      emit("tool-error", { tool: name, message: error.message });
      throw error;
    }
  };

  return {
    read_file: (relativePath) => withTool("read_file", { path: relativePath }, () => fs.readFile(resolve(relativePath), "utf8")),
    write_file: (relativePath, content) => withTool("write_file", { path: relativePath }, async () => {
      const target = resolve(relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(content ?? ""), "utf8");
      return { path: relativePath };
    }),
    create_file: (relativePath, content) => withTool("create_file", { path: relativePath }, async () => {
      const target = resolve(relativePath);
      try { await fs.access(target); throw new Error(`File already exists: ${relativePath}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(content ?? ""), "utf8");
      return { path: relativePath };
    }),
    edit_file: (relativePath, search, replacement) => withTool("edit_file", { path: relativePath }, async () => {
      const target = resolve(relativePath);
      const current = await fs.readFile(target, "utf8");
      if (!String(search)) throw new Error("Search text is required");
      if (!current.includes(String(search))) throw new Error(`Search text was not found in ${relativePath}`);
      await fs.writeFile(target, current.replace(String(search), String(replacement ?? "")), "utf8");
      return { path: relativePath };
    }),
    delete_file: (relativePath) => withTool("delete_file", { path: relativePath }, async () => {
      await fs.rm(resolve(relativePath), { force: false });
      return { path: relativePath };
    }),
    inspect_package_json: () => withTool("inspect_package_json", {}, async () => JSON.parse(await fs.readFile(resolve("package.json"), "utf8"))),
    search_project: async (term) => withTool("search_project", { term }, async () => {
      const results = [];
      async function walk(directory) {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          if (["node_modules", ".git", "dist", "build"].includes(entry.name)) continue;
          const target = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(target);
          else if (entry.isFile()) {
            const content = await fs.readFile(target, "utf8").catch(() => "");
            if (content.toLowerCase().includes(String(term).toLowerCase())) results.push(path.relative(root, target));
          }
        }
      }
      await walk(root);
      return results.slice(0, 100);
    }),
    run_command: (command, args = [], onOutput) => withTool("run_command", { command, args }, () => runAllowlisted(command, args, root, onOutput)),
    run_tests: () => withTool("run_tests", {}, () => runAllowlisted(process.platform === "win32" ? "npm.cmd" : "npm", ["test", "--", "--runInBand"], root, (output) => emit("tool-output", { tool: "run_tests", output: output.slice(-4000) }))),
    run_build: () => withTool("run_build", {}, () => runAllowlisted(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], root, (output) => emit("tool-output", { tool: "run_build", output: output.slice(-4000) }))),
  };
}
