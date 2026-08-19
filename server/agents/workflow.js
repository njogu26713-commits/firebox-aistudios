// Shared Firebox single-agent workflow contract.

export const WORKFLOW_STAGES = [
  { id: "understand", label: "Requirements understood", capability: "Planning" },
  { id: "inspect", label: "Project structure inspected", capability: "Project inspection" },
  { id: "project", label: "Project initialized", capability: "Project setup" },
  { id: "code", label: "Application code created or updated", capability: "Coding" },
  { id: "dependencies", label: "Dependencies installed", capability: "Dependencies" },
  { id: "test", label: "Tests and build verified", capability: "Testing" },
  { id: "repair", label: "Errors diagnosed and repaired", capability: "Repair" },
  { id: "preview", label: "Live preview prepared", capability: "Preview" },
];

export const MAX_REPAIR_ATTEMPTS = 3;

export const AGENT_CAPABILITIES = {
  Architect: { id: "understand", label: "Planning", activity: "Understanding requirements and project architecture" },
  Backend: { id: "code", label: "Building", activity: "Creating the application foundation and server behavior" },
  Frontend: { id: "code", label: "Building", activity: "Creating the user interface and interactions" },
  Database: { id: "code", label: "Building", activity: "Designing the data model and persistence layer" },
  Security: { id: "test", label: "Verifying", activity: "Checking security boundaries and input handling" },
  QA: { id: "test", label: "Testing", activity: "Running quality checks and covering failure cases" },
  Deployment: { id: "preview", label: "Preview", activity: "Preparing the project for preview and deployment" },
};

export const PLAN_SCHEMA = {
  summary: "string",
  steps: ["string"],
  decisionNarration: "string",
  existingProject: "boolean",
  needsConfirmation: "boolean",
  confirmationReason: "string|null",
};

export function buildPlanningPrompt({ description, fileNames = [] }) {
  const projectContext = fileNames.length
    ? `An existing project is open. Inspect it before proposing changes. Current files include: ${fileNames.slice(0, 50).join(", ")}.`
    : "No existing project files are open. Treat this as a new project request.";

  return `You are the planning phase of the Firebox Agent. Understand the user's request before any code is changed.\n\n${projectContext}\n\nUser request:\n${description}\n\nReturn ONLY valid JSON matching this shape:\n${JSON.stringify(PLAN_SCHEMA, null, 2)}\n\nRules:\n- Make 4 to 8 concrete, user-readable steps.
- Return decisionNarration as one concise user-facing sentence naming the actual files/components you expect to inspect or change. Do not use generic wording; mention paths when they are known from the project context.
- Do not generate source code.\n- Set existingProject true only when files are present and the request is an edit/extension.\n- Set needsConfirmation true only for destructive changes, production deployment, real payments, secret exposure, or other irreversible actions.\n- If no confirmation is needed, confirmationReason must be null.\n- The plan must mention inspection for an existing project before editing it.`;
}

export function normalizePlan(value) {
  const plan = value && typeof value === "object" ? value : {};
  const steps = Array.isArray(plan.steps)
    ? plan.steps.map((step) => String(step).trim()).filter(Boolean).slice(0, 8)
    : [];
  return {
    summary: String(plan.summary || "I understand what you want to build.").trim(),
    decisionNarration: String(plan.decisionNarration || "").trim(),
    steps: steps.length ? steps : [
      "Understand the requirements",
      "Set up or inspect the project",
      "Implement the requested changes",
      "Install dependencies and verify the build",
      "Open the preview",
    ],
    existingProject: Boolean(plan.existingProject),
    needsConfirmation: Boolean(plan.needsConfirmation),
    confirmationReason: plan.needsConfirmation ? String(plan.confirmationReason || "High-impact action requires confirmation") : null,
  };
}
