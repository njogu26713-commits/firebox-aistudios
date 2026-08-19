import Build from "../models/Build.js";

const clip = (value, length = 12000) => String(value ?? "").slice(0, length);

export function createCloudProjectTools({ build, emit = () => {}, runtime = null }) {
  const structuredEvent = (name, phase, input = {}, extra = {}) => {
    const path = input.path || input.file || extra.path;
    const command = input.command ? [input.command, ...(input.args || [])].join(" ") : extra.command;
    const eventMap = { inspect_project:"task.started", read_file:"file.read", create_file:"file.created", write_file:"file.modified", edit_file:"file.modified", delete_file:"file.deleted", run_command:"command.started", install_package:"dependency.installing", run_tests:"test.started", run_build:"command.started", start_preview:"preview.starting", get_preview_status:"preview.starting", browser_open:"browser.opened", browser_inspect:"browser.inspected", browser_click:"browser.clicked", browser_fill:"browser.filled", browser_assert:"browser.asserted", browser_console:"browser.console" };
    const event = eventMap[name];
    if (event) emit(event, { phase, tool:name, title:name.replaceAll("_", " "), ...(path ? { path } : {}), ...(command ? { command } : {}), ...extra });
  };
  const withTool = async (name, input, action) => {
    structuredEvent(name, "started", input);
    emit("tool-start", { tool: name, input });
    try {
      const result = await action();
      const resultData = typeof result === "string" ? clip(result, 1000) : result;
      structuredEvent(name, "completed", input, { result:resultData, ...(result?.path ? { path:result.path } : {}) });
      emit("tool-complete", { tool: name, result: resultData });
      return result;
    } catch (error) {
      structuredEvent(name, "error", input, { message:error.message });
      emit("tool-error", { tool: name, message: error.message });
      throw error;
    }
  };

  const findFile = (filePath) => (build.files || []).find((file) => file.path === filePath);
  const saveFiles = async (files) => {
    build.files = files;
    await Build.updateOne({ _id: build._id }, { $set: { files } });
    if (runtime) await runtime.syncFiles(files);
      emit("files-updated", { files: files.map(({ content: _content, ...file }) => file), count: files.length });
      emit("file.modified", { phase:"completed", title:"Project files updated", count:files.length });
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
    run_command: (command, args = []) => withTool("run_command", { command, args }, async () => runtime ? runtime.runCommand(command, args) : (() => { throw new Error("Cloud Runtime is not available for this Agent job"); })()),
    install_package: (packageName) => withTool("install_package", { package: packageName }, async () => runtime ? runtime.installPackage(packageName) : (() => { throw new Error("Cloud Runtime is not available for this Agent job"); })()),
    run_tests: () => withTool("run_tests", {}, async () => runtime ? runtime.runCommand("npm", ["test", "--", "--runInBand"]) : (() => { throw new Error("Cloud Runtime is not available for this Agent job"); })()),
    run_build: () => withTool("run_build", {}, async () => runtime ? runtime.runCommand("npm", ["run", "build"]) : (() => { throw new Error("Cloud Runtime is not available for this Agent job"); })()),
    start_preview: () => withTool("start_preview", {}, async () => runtime ? runtime.startPreview() : (() => { throw new Error("Cloud Runtime is not available for this Agent job"); })()),
    get_preview_status: () => withTool("get_preview_status", {}, async () => runtime ? runtime.getPreviewStatus() : (() => { throw new Error("Cloud Runtime is not available for this Agent job"); })()),
    browser_open: (url) => withTool("browser_open", { url }, async () => runtime?.browser ? runtime.browser.browser_open(url) : (() => { throw new Error("Cloud browser runtime is not available for this Agent job"); })()),
    browser_inspect: () => withTool("browser_inspect", {}, async () => runtime?.browser ? runtime.browser.browser_inspect() : (() => { throw new Error("Cloud browser runtime is not available for this Agent job"); })()),
    browser_click: (selector) => withTool("browser_click", { selector }, async () => runtime?.browser ? runtime.browser.browser_click(selector) : (() => { throw new Error("Cloud browser runtime is not available for this Agent job"); })()),
    browser_fill: (selector, text) => withTool("browser_fill", { selector, text }, async () => runtime?.browser ? runtime.browser.browser_fill(selector, text) : (() => { throw new Error("Cloud browser runtime is not available for this Agent job"); })()),
    browser_assert: (selector, expectedText) => withTool("browser_assert", { selector, expectedText }, async () => runtime?.browser ? runtime.browser.browser_assert(selector, expectedText) : (() => { throw new Error("Cloud browser runtime is not available for this Agent job"); })()),
    browser_console: () => withTool("browser_console", {}, async () => runtime?.browser ? runtime.browser.browser_console() : (() => { throw new Error("Cloud browser runtime is not available for this Agent job"); })()),
  };
}
