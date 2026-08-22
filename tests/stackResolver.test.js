import test from "node:test";
import assert from "node:assert/strict";
import { resolveStack } from "../server/stackResolver.js";

test("resolves a full-stack new project with PostgreSQL when data is required", () => {
  const stack = resolveStack({ description: "Build a school management dashboard with users, authentication, and records." });
  assert.equal(stack.mode, "new");
  assert.equal(stack.framework, "React");
  assert.equal(stack.database.primary, "PostgreSQL");
  assert.equal(stack.database.required, true);
  assert.equal(stack.locked, true);
});

test("respects an explicit database preference for a new project", () => {
  const stack = resolveStack({ description: "Build a product catalog", preferences: { database: "MongoDB" } });
  assert.equal(stack.database.primary, "MongoDB");
});

test("detects and preserves an existing React TypeScript Vite PostgreSQL project", () => {
  const files = [
    { path: "package.json", content: '{"dependencies":{"react":"latest","vite":"latest","pg":"latest"}}' },
    { path: "tsconfig.json", content: "{}" },
    { path: "vite.config.ts", content: "export default {}" },
    { path: "src/App.tsx", content: "export default function App() {}" },
    { path: "src/index.css", content: "body {}" },
  ];
  const stack = resolveStack({ description: "Add dark mode", files, projectType: "existing" });
  assert.equal(stack.mode, "existing");
  assert.equal(stack.language, "TypeScript");
  assert.equal(stack.framework, "React");
  assert.equal(stack.buildTool, "Vite");
  assert.equal(stack.database.primary, "PostgreSQL");
  assert.equal(stack.locked, true);
});
