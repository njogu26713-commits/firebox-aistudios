/**
 * Extract named files from agent output.
 * Agents are instructed to use the format:
 *   ### FILE: path/to/file.ext
 *   ```lang
 *   content
 *   ```
 */

const LANG_MAP = {
  js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx",
  py: "python", json: "json", yml: "yaml", yaml: "yaml",
  md: "markdown", sh: "bash", dockerfile: "dockerfile",
  html: "html", css: "css", env: "bash", toml: "toml",
};

function detectLanguage(filepath) {
  const ext = filepath.split(".").pop().toLowerCase();
  const base = filepath.split("/").pop().toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  return LANG_MAP[ext] || "plaintext";
}

export function extractFiles(agentName, content) {
  const files = [];
  // Matches: ### FILE: path\n```lang\ncontent\n```
  const regex = /###\s+FILE:\s+([^\n]+)\s*\n```(?:[a-zA-Z]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1].trim();
    const fileContent = match[2];
    if (path && fileContent.trim()) {
      files.push({
        agent: agentName,
        path,
        content: fileContent,
        language: detectLanguage(path),
      });
    }
  }
  return files;
}
