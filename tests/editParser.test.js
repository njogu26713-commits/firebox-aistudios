/**
 * Tests for server/utils/editParser.js
 * Uses Node 20's built-in test runner: node --test tests/editParser.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditOutput, applyEdits } from "../server/utils/editParser.js";

// ── parseEditOutput ───────────────────────────────────────────────────────────

test("parses a single valid SEARCH/REPLACE hunk", () => {
  const output = `### FILE: src/app.js
<<<<<<< SEARCH
const x = 1;
=======
const x = 42;
>>>>>>> REPLACE`;
  const result = parseEditOutput(output);
  assert.deepEqual(result["src/app.js"], {
    hunks: [{ search: "const x = 1;\n", replace: "const x = 42;\n" }],
  });
});

test("parses multiple hunks for the same file", () => {
  const output = `### FILE: src/app.js
<<<<<<< SEARCH
const a = 1;
=======
const a = 10;
>>>>>>> REPLACE
<<<<<<< SEARCH
const b = 2;
=======
const b = 20;
>>>>>>> REPLACE`;
  const result = parseEditOutput(output);
  assert.equal(result["src/app.js"].hunks.length, 2);
});

test("parses hunks for multiple files", () => {
  const output = `### FILE: src/a.js
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE
### FILE: src/b.js
<<<<<<< SEARCH
hello
=======
world
>>>>>>> REPLACE`;
  const result = parseEditOutput(output);
  assert.ok(result["src/a.js"]?.hunks?.length === 1);
  assert.ok(result["src/b.js"]?.hunks?.length === 1);
});

test("falls back to fullContent when no hunks but fenced block present (new file scenario)", () => {
  const output = `### FILE: src/new.js
\`\`\`js
console.log("hello");
\`\`\``;
  const result = parseEditOutput(output);
  assert.ok(result["src/new.js"]?.fullContent?.includes("console.log"));
  assert.equal(result["src/new.js"]?.hunks, undefined);
});

test("returns empty object for malformed output with no FILE markers", () => {
  const result = parseEditOutput("some random text without any markers");
  assert.deepEqual(result, {});
});

test("returns empty object for completely empty input", () => {
  assert.deepEqual(parseEditOutput(""), {});
});

// ── applyEdits ────────────────────────────────────────────────────────────────

test("applies a matching hunk and returns applied=1 failed=0", () => {
  const original = "const x = 1;\nconst y = 2;\n";
  const { content, applied, failed } = applyEdits(original, {
    hunks: [{ search: "const x = 1;\n", replace: "const x = 99;\n" }],
  });
  assert.equal(content, "const x = 99;\nconst y = 2;\n");
  assert.equal(applied, 1);
  assert.equal(failed, 0);
});

test("returns original content and failed=1 when SEARCH text not found", () => {
  const original = "const x = 1;\n";
  const { content, applied, failed } = applyEdits(original, {
    hunks: [{ search: "this text is not in the file\n", replace: "replaced\n" }],
  });
  assert.equal(content, original);  // unchanged
  assert.equal(applied, 0);
  assert.equal(failed, 1);
});

test("applies matching hunks and counts failed ones separately", () => {
  const original = "line1\nline2\nline3\n";
  const { content, applied, failed } = applyEdits(original, {
    hunks: [
      { search: "line1\n", replace: "LINE1\n" },           // matches
      { search: "this does not exist\n", replace: "x\n" }, // no match
    ],
  });
  assert.equal(content, "LINE1\nline2\nline3\n");
  assert.equal(applied, 1);
  assert.equal(failed, 1);
});

test("normalises \\r\\n line endings when matching", () => {
  const original = "const x = 1;\n";
  const { content, applied } = applyEdits(original, {
    hunks: [{ search: "const x = 1;\r\n", replace: "const x = 42;\n" }],
  });
  assert.equal(content, "const x = 42;\n");
  assert.equal(applied, 1);
});

test("applies fullContent for new files (applied=1 failed=0)", () => {
  const { content, applied, failed } = applyEdits("", {
    fullContent: "console.log('hello');\n",
  });
  assert.equal(content, "console.log('hello');\n");
  assert.equal(applied, 1);
  assert.equal(failed, 0);
});

test("returns applied=0 failed=0 for empty hunks array", () => {
  const original = "const x = 1;\n";
  const { content, applied, failed } = applyEdits(original, { hunks: [] });
  assert.equal(content, original);
  assert.equal(applied, 0);
  assert.equal(failed, 0);
});
