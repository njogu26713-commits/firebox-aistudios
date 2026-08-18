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
];

export const FIREBOX_CAPABILITIES = [
  { id: "planning", label: "Planning", tools: ["inspect_project", "search_project"] },
  { id: "coding", label: "Coding", tools: ["read_file", "create_file", "write_file", "edit_file", "delete_file"] },
  { id: "dependencies", label: "Dependencies", tools: ["install_package", "run_command"] },
  { id: "testing", label: "Testing", tools: ["run_tests", "run_build"] },
  { id: "repair", label: "Repair", tools: ["read_file", "search_project", "edit_file", "run_tests", "run_build"] },
  { id: "preview", label: "Preview", tools: ["start_preview", "get_preview_status"] },
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
};
