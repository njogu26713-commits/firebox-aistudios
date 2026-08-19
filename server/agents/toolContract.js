export const FIREBOX_TOOL_NAMES = [
  "inspect_project",
  "read_file",
  "search_project",
  "create_file",
  "write_file",
  "edit_file",
  "delete_file",
  "run_command",
  "install_package",
  "run_tests",
  "run_build",
  "start_preview",
  "get_preview_status",
  "browser_open",
  "browser_inspect",
  "browser_click",
  "browser_fill",
  "browser_assert",
  "browser_console",
];

const stringProperty = (description) => ({ type: "string", description });

export const FIREBOX_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "inspect_project",
      description: "Inspect the current Firebox project before making major changes.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file inside the controlled Firebox project workspace.",
      parameters: { type: "object", properties: { path: stringProperty("Project-relative file path") }, required: ["path"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_project",
      description: "Search project files for a text term before editing existing code.",
      parameters: { type: "object", properties: { term: stringProperty("Text to search for") }, required: ["term"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file inside the controlled Firebox project workspace.",
      parameters: { type: "object", properties: { path: stringProperty("Project-relative file path"), content: stringProperty("Complete file content") }, required: ["path", "content"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or replace a file inside the controlled Firebox project workspace.",
      parameters: { type: "object", properties: { path: stringProperty("Project-relative file path"), content: stringProperty("Complete file content") }, required: ["path", "content"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Apply a precise search-and-replace edit to a controlled project file.",
      parameters: { type: "object", properties: { path: stringProperty("Project-relative file path"), search: stringProperty("Exact existing text"), replacement: stringProperty("Replacement text") }, required: ["path", "search", "replacement"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a project file only when the requested change clearly requires it.",
      parameters: { type: "object", properties: { path: stringProperty("Project-relative file path") }, required: ["path"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a Firebox-allowlisted project command and inspect its output.",
      parameters: { type: "object", properties: { command: stringProperty("Allowlisted executable"), args: { type: "array", items: { type: "string" }, description: "Safe command arguments" } }, required: ["command"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "install_package",
      description: "Install a requested dependency through the project package manager.",
      parameters: { type: "object", properties: { package: stringProperty("Package name and optional version") }, required: ["package"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Run the project test command and return structured output.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "run_build",
      description: "Run the project build command and return structured output.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "start_preview",
      description: "Start or restart the controlled project development preview.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_preview_status",
      description: "Check whether the controlled project preview is running.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_open",
      description: "Open the running Firebox project preview in the controlled browser.",
      parameters: { type: "object", properties: { url: stringProperty("Preview URL or project-relative route such as /login") }, required: ["url"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_inspect",
      description: "Inspect the current browser page and return visible text plus interactive elements before clicking or filling.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_click",
      description: "Click a visible button, link, or other interactive element using a CSS selector from browser_inspect.",
      parameters: { type: "object", properties: { selector: stringProperty("CSS selector for the visible element") }, required: ["selector"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_fill",
      description: "Fill a visible input or textarea using a CSS selector from browser_inspect.",
      parameters: { type: "object", properties: { selector: stringProperty("CSS selector for the input or textarea"), text: stringProperty("Text to enter") }, required: ["selector", "text"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_assert",
      description: "Assert that a visible element exists and optionally contains expected text.",
      parameters: { type: "object", properties: { selector: stringProperty("CSS selector for the expected element"), expectedText: stringProperty("Optional text expected inside the element") }, required: ["selector"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_console",
      description: "Read browser console errors and page errors collected during the current browser session.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export const FIREBOX_CAPABILITIES = [
  { id: "planning", label: "Planning", tools: ["inspect_project", "search_project"] },
  { id: "coding", label: "Coding", tools: ["read_file", "create_file", "write_file", "edit_file", "delete_file"] },
  { id: "dependencies", label: "Dependencies", tools: ["install_package", "run_command"] },
  { id: "testing", label: "Testing", tools: ["run_tests", "run_build"] },
  { id: "repair", label: "Repair", tools: ["read_file", "search_project", "edit_file", "run_tests", "run_build"] },
  { id: "preview", label: "Preview", tools: ["start_preview", "get_preview_status", "browser_open", "browser_inspect", "browser_click", "browser_fill", "browser_assert", "browser_console"] },
  { id: "browser_testing", label: "Browser testing", tools: ["browser_open", "browser_inspect", "browser_click", "browser_fill", "browser_assert", "browser_console"] },
];

export const TOOL_ACTIVITY_LABELS = {
  inspect_project: "Inspecting project structure",
  read_file: "Reading project file",
  search_project: "Searching project files",
  create_file: "Creating file",
  write_file: "Writing file",
  edit_file: "Editing file",
  delete_file: "Deleting file",
  run_command: "Running command",
  install_package: "Installing dependencies",
  run_tests: "Running tests",
  run_build: "Running build",
  start_preview: "Starting preview",
  get_preview_status: "Checking preview status",
  browser_open: "Opening the preview in the browser",
  browser_inspect: "Inspecting the rendered page",
  browser_click: "Clicking a browser element",
  browser_fill: "Filling a browser form",
  browser_assert: "Checking the rendered UI",
  browser_console: "Reading browser console errors",
};
