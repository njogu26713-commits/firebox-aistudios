import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanningPrompt, normalizePlan, MAX_REPAIR_ATTEMPTS } from "../server/agents/workflow.js";

test("normalizes a valid Firebox build plan", () => {
  const plan = normalizePlan({ summary: "Build a dashboard", steps: ["Inspect", "Implement"], existingProject: true });
  assert.equal(plan.summary, "Build a dashboard");
  assert.deepEqual(plan.steps, ["Inspect", "Implement"]);
  assert.equal(plan.existingProject, true);
  assert.equal(plan.needsConfirmation, false);
});

test("provides safe defaults for malformed plans", () => {
  const plan = normalizePlan({});
  assert.equal(plan.steps.length, 5);
  assert.equal(plan.confirmationReason, null);
});

test("planning prompt requires inspection for existing files", () => {
  const prompt = buildPlanningPrompt({ description: "Add authentication", fileNames: ["package.json", "src/App.jsx"] });
  assert.match(prompt, /existing project/i);
  assert.match(prompt, /inspect/i);
  assert.match(prompt, /src\/App\.jsx/);
});

test("repair attempts are bounded", () => {
  assert.equal(MAX_REPAIR_ATTEMPTS, 3);
});
