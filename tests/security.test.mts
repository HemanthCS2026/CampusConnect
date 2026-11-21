import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { getDatabaseErrorCode } from "../lib/database-error-code.ts";
import { isValidResumeUrl, validatePersonName, validateUsername } from "../lib/input-validation.ts";
import { readBoundedJsonBody } from "../lib/request-body.ts";
import { isSameOriginRequest } from "../lib/request-security.ts";
import {
  DEVELOPMENT_SESSION_SECRET,
  resolveSessionSecret,
} from "../lib/session-secret.ts";

test("production session secrets must be present and sufficiently strong", () => {
  assert.equal(resolveSessionSecret(undefined, "production"), null);
  assert.equal(resolveSessionSecret("short", "production"), null);
  assert.equal(resolveSessionSecret("x".repeat(48), "production"), null);
  assert.equal(
    resolveSessionSecret(DEVELOPMENT_SESSION_SECRET, "production"),
    null
  );

  const generatedSecret = randomBytes(32).toString("base64url");
  assert.equal(
    resolveSessionSecret(generatedSecret, "production"),
    generatedSecret
  );
});

test("the session-secret fallback remains development-only", () => {
  assert.equal(
    resolveSessionSecret(undefined, "development"),
    DEVELOPMENT_SESSION_SECRET
  );
  assert.equal(resolveSessionSecret(undefined, "test"), null);
});

test("same-origin checks allow same-origin and non-browser requests", () => {
  assert.equal(
    isSameOriginRequest(
      new Request("https://campus.example/api/action", {
        method: "POST",
        headers: { origin: "https://campus.example" },
      })
    ),
    true
  );
  assert.equal(
    isSameOriginRequest(
      new Request("https://campus.example/api/action", { method: "POST" })
    ),
    true
  );
});

test("same-origin checks reject cross-origin and opaque origins", () => {
  assert.equal(
    isSameOriginRequest(
      new Request("https://campus.example/api/action", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      })
    ),
    false
  );
  assert.equal(
    isSameOriginRequest(
      new Request("https://campus.example/api/action", {
        method: "POST",
        headers: { origin: "null" },
      })
    ),
    false
  );
});

test("bounded JSON parsing distinguishes oversized and malformed bodies", async () => {
  assert.deepEqual(
    await readBoundedJsonBody(
      new Request("http://localhost", { method: "POST", body: '{"a":1}' }),
      7
    ),
    { ok: true, value: { a: 1 } }
  );
  assert.deepEqual(
    await readBoundedJsonBody(
      new Request("http://localhost", { method: "POST", body: '{"a":1}' }),
      6
    ),
    { ok: false, reason: "too-large" }
  );
  assert.deepEqual(
    await readBoundedJsonBody(
      new Request("http://localhost", { method: "POST", body: "{" }),
      16
    ),
    { ok: false, reason: "invalid" }
  );
});

test("registration and resume inputs honor PostgreSQL character limits", () => {
  assert.deepEqual(validateUsername("  campususer  "), {
    ok: true,
    value: "campususer",
  });
  assert.equal(validateUsername("  ").ok, false);
  assert.equal(validateUsername("x".repeat(51)).ok, false);
  assert.equal(validatePersonName("  ").ok, false);
  assert.deepEqual(validatePersonName("  Hemanth  "), {
    ok: true,
    value: "Hemanth",
  });
  assert.equal(validatePersonName("x".repeat(51)).ok, false);
  assert.equal(isValidResumeUrl(null), true);
  assert.equal(isValidResumeUrl("x".repeat(255)), true);
  assert.equal(isValidResumeUrl("x".repeat(256)), false);
  assert.equal(isValidResumeUrl(42), false);
});

test("database errors expose only a valid SQLSTATE code", () => {
  const error = Object.assign(new Error("sensitive connection detail"), {
    code: "23503",
  });
  assert.equal(getDatabaseErrorCode(error), "23503");
  assert.equal(getDatabaseErrorCode(new Error("private diagnostic")), null);
  assert.equal(
    getDatabaseErrorCode({ code: "connection string must not be logged" }),
    null
  );
});
