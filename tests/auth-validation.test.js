import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, validateCredentials } from "../server/routes/auth.js";

test("normalizes the reported Gmail address and accepts it", () => {
  const email = normalizeEmail(" bgithinji927@gmail.com ");
  assert.equal(email, "bgithinji927@gmail.com");
  assert.equal(validateCredentials(email, "password1234"), null);
});

test("rejects malformed email values with the app error", () => {
  assert.equal(validateCredentials("not-an-email", "password1234"), "Enter a valid email address");
});

test("keeps the password validation contract", () => {
  assert.equal(validateCredentials("bgithinji927@gmail.com", "short"), "Password must be at least 8 characters");
});
