import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
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
