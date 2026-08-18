import Build from "../models/Build.js";

const clip = (value, length = 12000) => String(value ?? "").slice(0, length);

export function createCloudProjectTools({ build, emit = () => {} }) {
  const withTool = async (name, input, action) => {
    emit("tool-start", { tool: name, input });
    try {
      const result = await action();
      emit("tool-complete", { tool: name, result: typeof result === "string" ? clip(result, 1000) : result });
      return result;
    } catch (error) {
      emit("tool-error", { tool: name, message: error.message });
      throw error;
    }
  };

  const findFile = (filePath) => (build.files || []).find((file) => file.path === filePath);
  const saveFiles = async (files) => {
    build.files = files;
    await Build.updateOne({ _id: build._id }, { $set: { files } });
    emit("files-updated", { files: files.map(({ content: _content, ...file }) => file), count: files.length });
  };

  return {
    inspect_project: () => withTool("inspect_project", {}, async () => ({
      files: (build.files || []).map((file) => file.path).slice(0, 500),
      packageJson: (() => { const pkg = findFile("package.json"); try { return pkg ? JSON.parse(pkg.content) : null; } catch { return null; } })(),
      projectName: "firebox-project",
    })),
    read_file: (filePath) => withTool("read_file", { path: filePath }, async () => {
      const file = findFile(filePath);
      if (!file) throw new Error(`File not found: ${filePath}`);
      return clip(file.content);
    }),
    search_project: (term) => withTool("search_project", { term }, async () => (build.files || []).filter((file) => String(file.content || "").toLowerCase().includes(String(term).toLowerCase())).map((file) => file.path)),
    create_file: (filePath, content) => withTool("create_file", { path: filePath }, async () => {
      if (findFile(filePath)) throw new Error(`File already exists: ${filePath}`);
      const files = [...(build.files || []), { path: filePath, content: String(content ?? ""), language: filePath.split(".").pop() || "text", agent: "Firebox Agent" }];
      await saveFiles(files);
      return { path: filePath };
    }),
    write_file: (filePath, content) => withTool("write_file", { path: filePath }, async () => {
      const files = [...(build.files || [])];
      const index = files.findIndex((file) => file.path === filePath);
      const next = { path: filePath, content: String(content ?? ""), language: filePath.split(".").pop() || "text", agent: "Firebox Agent" };
      if (index === -1) files.push(next); else files[index] = { ...files[index], ...next };
      await saveFiles(files);
      return { path: filePath };
    }),
    edit_file: (filePath, search, replacement) => withTool("edit_file", { path: filePath }, async () => {
      const file = findFile(filePath);
      if (!file) throw new Error(`File not found: ${filePath}`);
      if (!String(file.content || "").includes(String(search))) throw new Error(`Search text was not found in ${filePath}`);
      const files = [...(build.files || [])];
      const index = files.findIndex((item) => item.path === filePath);
      files[index] = { ...files[index], content: String(file.content).replace(String(search), String(replacement ?? "")) };
      await saveFiles(files);
      return { path: filePath };
    }),
    delete_file: (filePath) => withTool("delete_file", { path: filePath }, async () => {
      if (!findFile(filePath)) throw new Error(`File not found: ${filePath}`);
      await saveFiles((build.files || []).filter((file) => file.path !== filePath));
      return { path: filePath };
    }),
    run_command: (command, args = []) => withTool("run_command", { command, args }, async () => ({ ok: true, skipped: true, message: "Cloud command execution is unavailable in Railway; file changes were persisted, but verification requires the Local Engine." })),
    install_package: (packageName) => withTool("install_package", { package: packageName }, async () => ({ ok: true, skipped: true, message: "Cloud dependency installation is unavailable in Railway; connect the Local Engine to install packages." })),
    run_tests: () => withTool("run_tests", {}, async () => ({ ok: true, skipped: true, message: "Cloud test execution is unavailable in Railway; connect the Local Engine to run tests." })),
    run_build: () => withTool("run_build", {}, async () => ({ ok: true, skipped: true, message: "Cloud build execution is unavailable in Railway; connect the Local Engine to run the build." })),
    start_preview: () => withTool("start_preview", {}, async () => ({ running: false, message: "Cloud live preview requires a connected project runtime." })),
    get_preview_status: () => withTool("get_preview_status", {}, async () => ({ running: false })),
  };
}
